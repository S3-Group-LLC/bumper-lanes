// Switches backups on: puts the three secrets GitHub needs into your repository's
// Actions secrets — without ever showing their values.
//
//   npm run connect-backups            set what it can, explain the rest
//   npm run connect-backups -- --check say which secrets are set (names only)
//
//   SUPABASE_DB_URL      the database address (Session pooler)
//   SUPABASE_SECRET_KEY  lets backups save your stored files
//   BACKUP_PASSPHRASE    locks your backups; only you know it
//
// 1. If the `vercel` CLI is signed in and linked, it reads the database address and the
//    secret key from the Supabase integration's settings in Vercel. (Settings marked
//    Sensitive can't be read back — those are asked for instead.)
// 2. In a terminal you type in, it asks for the rest with a hidden prompt.
// 3. It saves each one with `gh secret set` (needs gh signed in).
// Anything it can't do, it explains click by click.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSecretKey } from '../src/lib/supabase-settings.mjs';

export const SECRETS = ['SUPABASE_DB_URL', 'SUPABASE_SECRET_KEY', 'BACKUP_PASSPHRASE'];

const WHERE = {
  SUPABASE_DB_URL:
    'Supabase → your project → Connect → Session pooler → copy the URI and replace [YOUR-PASSWORD] with your database password',
  SUPABASE_SECRET_KEY: 'Supabase → Project Settings → API Keys → Secret keys → copy (or create one)',
  BACKUP_PASSPHRASE: 'a long sentence you make up — write it down somewhere safe; nobody can open your backups without it',
};

/**
 * Turns a Supabase connection string into the Session pooler form GitHub can reach.
 * Returns { url } or { problem }.
 */
export function sessionPoolerUrl(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return { problem: "isn't a connection string" };
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) return { problem: "isn't a connection string" };
  if (/^db\.[a-z0-9]{20}\.supabase\.co$/.test(url.hostname)) {
    return { problem: 'is the direct connection, which GitHub can\'t reach — use the Session pooler one' };
  }
  if (!url.hostname.endsWith('.pooler.supabase.com')) return { problem: "isn't a Supabase pooler address" };
  if (!url.password) return { problem: 'has no password in it' };
  url.port = '5432'; // session mode (6543 is transaction mode, which backups can't use)
  const sslmode = url.searchParams.get('sslmode');
  url.search = sslmode ? `?sslmode=${sslmode}` : '';
  return { url: url.toString() };
}

/** Reads "NAME=value" lines (as written by `vercel env pull`). */
export function parseDotenv(text) {
  const vars = {};
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    vars[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
  return vars;
}

/** What Vercel's Supabase integration settings give us (empty = Sensitive, can't be read). */
export function fromVercel(vars) {
  const found = {};
  for (const name of ['POSTGRES_URL_NON_POOLING', 'POSTGRES_URL']) {
    if (found.SUPABASE_DB_URL || !vars[name]) continue;
    const { url } = sessionPoolerUrl(vars[name]);
    if (url) found.SUPABASE_DB_URL = url;
  }
  const key = vars.SUPABASE_SECRET_KEY || vars.SUPABASE_SERVICE_ROLE_KEY;
  if (key && isSecretKey(key)) found.SUPABASE_SECRET_KEY = key;
  return found;
}

/** Checks a value someone typed. Returns a problem in plain English, or null. */
export function checkValue(name, value) {
  const v = value.trim();
  if (!v) return 'nothing was entered';
  if (name === 'SUPABASE_DB_URL') return sessionPoolerUrl(v).problem ?? null;
  if (name === 'SUPABASE_SECRET_KEY') return isSecretKey(v) ? null : "that isn't a secret key (it should start with sb_secret_)";
  if (name === 'BACKUP_PASSPHRASE') return v.length >= 20 ? null : 'use at least 20 characters — a short sentence is ideal';
  return null;
}

/** Click-by-click steps for the secrets still missing. */
export function manualSteps(repo, missing) {
  const page = repo ? `https://github.com/${repo}/settings/secrets/actions/new` : 'your repository → Settings → Secrets and variables → Actions → New repository secret';
  return [
    'Add these in GitHub (names exactly as written):',
    `  Open ${page}`,
    ...missing.map((n, i) => `  ${i + 1}. Name: ${n}\n     Secret: ${WHERE[n]}\n     → Add secret`),
    'Never paste these into a chat — only into GitHub.',
  ].join('\n');
}

const defaultRun = (cmd, args, input, cwd) => {
  const r = spawnSync(cmd, args, { cwd, input, encoding: 'utf8', stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
  return { ok: !r.error && r.status === 0, stdout: r.stdout ?? '' };
};

/** Asks without echoing what's typed. */
function hiddenPrompt(question) {
  return new Promise((done) => {
    const { stdin, stdout } = process;
    stdout.write(question);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          return done(value);
        }
        if (ch === '\u0003') process.exit(130); // Ctrl+C
        value = ch === '\u007f' ? value.slice(0, -1) : value + ch;
      }
    };
    stdin.on('data', onData);
  });
}

/** Is this secret (or an older one that does the same job) in the list? */
export const secretIsSet = (have, name) =>
  have.includes(name) ||
  (name === 'SUPABASE_SECRET_KEY' && (have.includes('SUPABASE_SERVICE_ROLE_KEY') || have.includes('SUPABASE_ACCESS_TOKEN')));

/** Which secrets the repository has (names only). null if gh can't tell. */
export function existingSecrets(run = defaultRun, cwd = undefined) {
  const r = run('gh', ['secret', 'list', '--json', 'name', '--jq', '.[].name'], undefined, cwd);
  return r.ok ? r.stdout.split('\n').map((s) => s.trim()).filter(Boolean) : null;
}

export async function connectBackups({ root, run = defaultRun, ask = hiddenPrompt, interactive = Boolean(process.stdin.isTTY), log = console.log } = {}) {
  const gh = run('gh', ['auth', 'status']).ok;
  const repo = gh ? run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).stdout.trim() : '';
  const have = gh ? existingSecrets(run) ?? [] : [];
  const needed = SECRETS.filter((n) => !secretIsSet(have, n));
  for (const n of SECRETS.filter((n) => !needed.includes(n))) log(`✓ ${n} is already set`);
  if (!needed.length) {
    log('\nBackups are connected. Run one now: GitHub → Actions → Backup → Run workflow (or ask your agent: "backup now").');
    return { set: [], manual: [] };
  }
  if (!gh) {
    log("GitHub CLI isn't signed in here, so I can't add the secrets for you.\n");
    log(manualSteps(repo, needed));
    return { set: [], manual: needed };
  }

  // 1. From Vercel, if possible.
  const values = {};
  if (existsSync(join(root, '.vercel', 'project.json')) && run('vercel', ['whoami']).ok) {
    const dir = mkdtempSync(join(tmpdir(), 'bl-env-'));
    try {
      const file = join(dir, 'env');
      if (run('vercel', ['env', 'pull', file, '--environment=production', '--yes']).ok && existsSync(file)) {
        Object.assign(values, fromVercel(parseDotenv(readFileSync(file, 'utf8'))));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true }); // the file held secrets
    }
    for (const n of Object.keys(values)) if (needed.includes(n)) log(`• ${n}: found in your Vercel settings`);
  }

  // 2. Hidden prompts for the rest.
  for (const name of needed.filter((n) => !values[n])) {
    if (!interactive) break;
    log(`\n${name} — ${WHERE[name]}.`);
    for (let attempt = 0; attempt < 3 && !values[name]; attempt++) {
      const value = await ask(`Paste or type it (nothing will show): `);
      const problem = checkValue(name, value);
      if (problem) {
        log(`  That ${problem}. Try again.`);
        continue;
      }
      if (name === 'BACKUP_PASSPHRASE' && (await ask('Type it again to confirm: ')) !== value) {
        log("  They didn't match. Try again.");
        continue;
      }
      values[name] = name === 'SUPABASE_DB_URL' ? sessionPoolerUrl(value).url : value.trim();
    }
  }

  // 3. Save.
  const set = [];
  for (const name of needed.filter((n) => values[n])) {
    const ok = run('gh', ['secret', 'set', name], values[name]).ok; // value goes in on stdin, never on the command line
    log(ok ? `✓ ${name} saved in GitHub` : `✗ ${name} couldn't be saved (gh secret set failed)`);
    if (ok) set.push(name);
  }
  const manual = needed.filter((n) => !set.includes(n));
  if (manual.length) {
    log(`\n${manual.length === needed.length ? "I couldn't add the secrets from here." : 'A few are left for you.'}\n`);
    log(manualSteps(repo, manual));
  } else {
    log('\nBackups are connected. Run one now: GitHub → Actions → Backup → Run workflow (or ask your agent: "backup now").');
  }
  return { set, manual };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(join(fileURLToPath(import.meta.url), '..', '..'));
  if (process.argv.includes('--check')) {
    const have = existingSecrets();
    if (!have) {
      console.log("Can't check from here (GitHub CLI not signed in). Look at GitHub → Settings → Secrets and variables → Actions.");
    } else {
      for (const n of SECRETS) console.log(`${secretIsSet(have, n) ? '✓' : '✗'} ${n}`);
    }
  } else {
    await connectBackups({ root });
  }
}
