import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkValue, connectBackups, fromVercel, manualSteps, parseDotenv, sessionPoolerUrl } from '../scripts/connect-backups.mjs';
import { backupCheck } from '../scripts/doctor.mjs';

// "connect backups": sets the three GitHub secrets without ever showing a value.

const REF = 'abcdefghijklmnopqrst';
const POOLER = `postgresql://postgres.${REF}:s3cret-pw@aws-0-us-east-1.pooler.supabase.com`; // bumper-lanes:allow-secret (fake)
const KEY = 'sb_secret_' + 'k'.repeat(12);
const PASS = 'my long backup passphrase sentence';

/** A stand-in for the gh and vercel CLIs that records what they were asked to do. */
function stubCli({ ghSignedIn = true, have = [] as string[], vercelEnv = '' as string | null } = {}) {
  const calls: { cmd: string; args: string[]; input?: string }[] = [];
  const run = (cmd: string, args: string[], input?: string) => {
    calls.push({ cmd, args, input });
    const key = `${cmd} ${args.slice(0, 2).join(' ')}`;
    if (key === 'gh auth status') return { ok: ghSignedIn, stdout: '' };
    if (key === 'gh repo view') return { ok: true, stdout: 'learner/my-project\n' };
    if (key === 'gh secret list') return { ok: ghSignedIn, stdout: have.join('\n') };
    if (key === 'gh secret set') return { ok: true, stdout: '' };
    if (key === 'vercel whoami') return { ok: vercelEnv !== null, stdout: 'learner' };
    if (key === 'vercel env pull') {
      writeFileSync(args[2], vercelEnv ?? '');
      return { ok: true, stdout: '' };
    }
    return { ok: false, stdout: '' };
  };
  return { run, calls };
}

function project(linkedToVercel: boolean) {
  const root = mkdtempSync(join(tmpdir(), 'cb-'));
  if (linkedToVercel) {
    mkdirSync(join(root, '.vercel'));
    writeFileSync(join(root, '.vercel', 'project.json'), '{}');
  }
  return root;
}

describe('connection string', () => {
  it('turns the pooler address into session mode (port 5432) and drops extra settings', () => {
    expect(sessionPoolerUrl(`${POOLER}:6543/postgres?sslmode=require&supa=base-pooler.x`).url).toBe(`${POOLER}:5432/postgres?sslmode=require`);
  });

  it('explains the direct address, a missing password and nonsense', () => {
    expect(sessionPoolerUrl(`postgresql://postgres:pw@db.${REF}.supabase.co:5432/postgres`).problem).toMatch(/direct connection/);
    expect(sessionPoolerUrl(`postgresql://postgres.${REF}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`).problem).toMatch(/no password/);
    expect(sessionPoolerUrl('hello').problem).toMatch(/isn't a connection string/);
  });

  it('checks typed values', () => {
    expect(checkValue('SUPABASE_SECRET_KEY', 'sb_publishable_abc')).toMatch(/sb_secret_/);
    expect(checkValue('BACKUP_PASSPHRASE', 'short')).toMatch(/20 characters/);
    expect(checkValue('BACKUP_PASSPHRASE', PASS)).toBeNull();
  });
});

describe('reading Vercel settings', () => {
  it('uses the Supabase integration names; Sensitive (empty) values are skipped', () => {
    const vars = parseDotenv(`POSTGRES_URL="${POOLER}:6543/postgres?sslmode=require"\nPOSTGRES_URL_NON_POOLING=""\nSUPABASE_SERVICE_ROLE_KEY="${KEY}"\n`);
    expect(fromVercel(vars)).toEqual({ SUPABASE_DB_URL: `${POOLER}:5432/postgres?sslmode=require`, SUPABASE_SECRET_KEY: KEY });
    expect(fromVercel(parseDotenv('POSTGRES_URL=""\nSUPABASE_SECRET_KEY=""\n'))).toEqual({});
  });
});

describe('connectBackups', () => {
  it('copies what Vercel has, asks for the passphrase, and never prints a value', async () => {
    const root = project(true);
    const { run, calls } = stubCli({ vercelEnv: `POSTGRES_URL_NON_POOLING="${POOLER}:5432/postgres"\nSUPABASE_SECRET_KEY="${KEY}"\n` });
    const out: string[] = [];
    const asked: string[] = [];
    const result = await connectBackups({
      root,
      run,
      interactive: true,
      ask: async (q: string) => (asked.push(q), PASS),
      log: (line: string) => out.push(line),
    });
    rmSync(root, { recursive: true, force: true });

    expect(result).toEqual({ set: ['SUPABASE_DB_URL', 'SUPABASE_SECRET_KEY', 'BACKUP_PASSPHRASE'], manual: [] });
    const sets = calls.filter((c) => c.args[0] === 'secret' && c.args[1] === 'set');
    expect(sets.map((c) => [c.args[2], c.input])).toEqual([
      ['SUPABASE_DB_URL', `${POOLER}:5432/postgres`],
      ['SUPABASE_SECRET_KEY', KEY],
      ['BACKUP_PASSPHRASE', PASS],
    ]);
    for (const c of calls) expect(c.args.join(' ')).not.toMatch(/s3cret-pw|sb_secret_|backup passphrase/); // values only on stdin
    expect(asked).toHaveLength(2); // passphrase + confirmation, typed by the learner
    const printed = out.join('\n');
    for (const secret of ['s3cret-pw', KEY, PASS]) expect(printed).not.toContain(secret);
    expect(printed).toMatch(/Backups are connected/);
  });

  it('in a cloud agent (no terminal to type in) it explains the rest click by click', async () => {
    const root = project(false);
    const { run, calls } = stubCli({ have: ['SUPABASE_DB_URL'] });
    const out: string[] = [];
    const result = await connectBackups({ root, run, interactive: false, log: (l: string) => out.push(l) });
    rmSync(root, { recursive: true, force: true });
    expect(result).toEqual({ set: [], manual: ['SUPABASE_SECRET_KEY', 'BACKUP_PASSPHRASE'] });
    expect(calls.some((c) => c.args[1] === 'set')).toBe(false);
    expect(out.join('\n')).toContain('https://github.com/learner/my-project/settings/secrets/actions/new');
    expect(out.join('\n')).toMatch(/✓ SUPABASE_DB_URL is already set/);
  });

  it('without the GitHub CLI signed in, it gives the steps instead', async () => {
    const { run } = stubCli({ ghSignedIn: false });
    const out: string[] = [];
    const result = await connectBackups({ root: tmpdir(), run, interactive: true, log: (l: string) => out.push(l) });
    expect(result.manual).toHaveLength(3);
    expect(out.join('\n')).toMatch(/Never paste these into a chat/);
  });

  it('older setups (access token) count as connected', async () => {
    const { run } = stubCli({ have: ['SUPABASE_DB_URL', 'SUPABASE_ACCESS_TOKEN', 'BACKUP_PASSPHRASE'] });
    const out: string[] = [];
    expect(await connectBackups({ root: tmpdir(), run, log: (l: string) => out.push(l) })).toEqual({ set: [], manual: [] });
  });

  it('manual steps name every secret and where it comes from', () => {
    const steps = manualSteps('a/b', ['SUPABASE_DB_URL', 'SUPABASE_SECRET_KEY', 'BACKUP_PASSPHRASE']);
    expect(steps).toMatch(/Session pooler/);
    expect(steps).toMatch(/API Keys/);
    expect(steps).toMatch(/write it down/);
  });

  it('explains how to get a database password when Vercel created the database', () => {
    expect(manualSteps('a/b', ['SUPABASE_DB_URL'])).toMatch(/Reset database password/);
  });

  it('says what to save and where the full steps are', () => {
    const steps = manualSteps('a/b', ['BACKUP_PASSPHRASE']);
    expect(steps).toMatch(/Save your database password and backup passphrase/);
    expect(steps).toContain('hellos3.com/bumper-lanes/get-started/add-secrets');
  });

  it('says what to run once the secrets are in, database changes first', () => {
    const steps = manualSteps('a/b', ['BACKUP_PASSPHRASE']);
    expect(steps.indexOf('Database changes')).toBeGreaterThan(-1);
    expect(steps.indexOf('Database changes')).toBeLessThan(steps.indexOf('Actions → Backup'));
  });
});

describe('doctor nudges until backups are on', () => {
  it('warns with the missing names and the 10-minute fix', () => {
    const r = backupCheck(['SUPABASE_DB_URL']);
    expect(r.status).toBe('warn');
    expect(r.detail).toContain('SUPABASE_SECRET_KEY, BACKUP_PASSPHRASE');
    expect(r.fix).toMatch(/connect-backups/);
  });

  it('is happy when all three are set, and honest when it can\'t see', () => {
    expect(backupCheck(['SUPABASE_DB_URL', 'SUPABASE_SECRET_KEY', 'BACKUP_PASSPHRASE']).status).toBe('ok');
    expect(backupCheck(null).status).toBe('check');
  });
});
