import { describe, it, expect, vi, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { clearTablesSql, filterData, fixRoles, fixSchema, stripMetaCommands, userSchemas } from '../scripts/backup/prepare-restore.mjs';
import { pickBackup } from '../scripts/backup/find-backup.mjs';
import { deployments, envExampleNames, settingsNames } from '../scripts/backup/site-info.mjs';
import { projectRef, secretKey } from '../scripts/backup/supabase-project.mjs';

const DATA = [
  "SELECT pg_catalog.set_config('search_path', '', false);",
  '\\restrict abc123',
  'COPY "auth"."users" ("id", "email") FROM stdin;',
  '1\ta@x.com',
  '\\.',
  'COPY "auth"."schema_migrations" ("version") FROM stdin;',
  'v1',
  '\\.',
  'COPY "storage"."objects" ("id") FROM stdin;',
  'o1',
  '\\.',
  'COPY "public"."todos" ("id", "title") FROM stdin;',
  '1\tbuy milk',
  '\\.',
  'COPY "realtime"."messages" ("id") FROM stdin;',
  'm1',
  '\\.',
  'COPY public.plain (id) FROM stdin;',
  '7',
  '\\.',
  "SELECT pg_catalog.setval('\"public\".\"todos_id_seq\"', 1, true);",
  "SELECT pg_catalog.setval('\"realtime\".\"messages_id_seq\"', 1, true);",
  '\\unrestrict abc123',
].join('\n');

describe('prepare-restore: only your data is restored', () => {
  const { sql, tables } = filterData(DATA, ['public', 'auth']);

  it('keeps public tables and user accounts', () => {
    expect(tables).toEqual(['"auth"."users"', '"public"."todos"', '"public"."plain"']);
    expect(sql).toContain('1\tbuy milk');
    expect(sql).toContain('1\ta@x.com');
  });

  it("skips Supabase's internal tables, storage rows and other schemas", () => {
    expect(sql).not.toContain('schema_migrations');
    expect(sql).not.toContain('storage');
    expect(sql).not.toContain('realtime');
    expect(sql).not.toMatch(/^v1$|^o1$|^m1$/m);
  });

  it('keeps sequence positions only for restored schemas', () => {
    expect(sql).toContain('todos_id_seq');
    expect(sql).not.toContain('messages_id_seq');
  });

  it('removes psql \\restrict meta-commands so any psql version can read it', () => {
    expect(sql).not.toMatch(/\\(un)?restrict/);
    expect(stripMetaCommands('\\restrict x\nSELECT 1;\n\\unrestrict x')).toBe('SELECT 1;');
  });

  it('empties exactly the restored tables, with DELETE (never TRUNCATE … CASCADE)', () => {
    expect(clearTablesSql(tables)).toBe('DELETE FROM "auth"."users";\nDELETE FROM "public"."todos";\nDELETE FROM "public"."plain";\n');
  });

  it('finds schemas your migrations created', () => {
    expect(userSchemas('CREATE SCHEMA IF NOT EXISTS "billing";\nCREATE SCHEMA reports;')).toEqual(['public', 'billing', 'reports']);
  });

  it('applies the known fixes from the Supabase restore guide', () => {
    expect(fixRoles('GRANT "postgres" TO "cli_login_postgres";')).toBe('-- GRANT "postgres" TO "cli_login_postgres";');
    expect(fixSchema('ALTER TABLE "public"."t" OWNER TO "supabase_admin";')).toMatch(/^-- /);
    expect(fixSchema('CREATE SCHEMA public;')).toBe('CREATE SCHEMA IF NOT EXISTS public;');
    expect(fixSchema('CREATE SCHEMA IF NOT EXISTS "x";')).toBe('CREATE SCHEMA IF NOT EXISTS "x";');
  });

  it('tolerates objects a new project already has (automatic RLS function + event trigger)', () => {
    const fixed = fixSchema(
      'CREATE FUNCTION "public"."rls_auto_enable"() RETURNS event_trigger\n    LANGUAGE plpgsql AS $$ BEGIN END $$;\n' +
        'CREATE EVENT TRIGGER "ensure_rls" ON ddl_command_end\n         WHEN TAG IN (\'CREATE TABLE\')\n   EXECUTE FUNCTION "public"."rls_auto_enable"();',
    );
    expect(fixed).toContain('CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"()');
    expect(fixed).toContain("IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls')");
    expect(fixed).toContain('EXECUTE $stmt$CREATE EVENT TRIGGER "ensure_rls" ON ddl_command_end');
  });
});

describe('find-backup: choosing what to restore', () => {
  const art = (name: string, created: string, runId: number, expired = false) => ({
    name,
    created_at: created,
    expired,
    workflow_run: { id: runId },
  });
  const artifacts = [
    art('backup-2026-10-05-run100-1', '2026-10-05T07:30:00Z', 100),
    art('backup-2026-10-06-run200-1', '2026-10-06T07:30:00Z', 200),
    art('backup-2026-10-06-run250-1', '2026-10-06T15:00:00Z', 250),
    art('backup-nodata-2026-10-07-run300-1', '2026-10-07T07:30:00Z', 300),
    art('backup-2026-10-07-run400-1', '2026-10-07T09:00:00Z', 400),
    art('backup-2026-09-01-run50-1', '2026-09-01T07:30:00Z', 50, true),
    art('something-else', '2026-10-08T00:00:00Z', 500),
  ];

  it('"latest" picks the newest data backup', () => {
    expect(pickBackup(artifacts, 'latest').artifact).toBe('backup-2026-10-07-run400-1');
  });

  it("never picks the safety backup this restore just made", () => {
    expect(pickBackup(artifacts, 'latest', 400).artifact).toBe('backup-2026-10-06-run250-1');
  });

  it('a date picks the newest backup from that day', () => {
    expect(pickBackup(artifacts, '2026-10-06').artifact).toBe('backup-2026-10-06-run250-1');
  });

  it('a run ID picks that run', () => {
    expect(pickBackup(artifacts, '200')).toMatchObject({ artifact: 'backup-2026-10-06-run200-1', runId: 200 });
  });

  it('skips expired and data-less backups, with a helpful error', () => {
    expect(() => pickBackup(artifacts, '2026-09-01')).toThrow(/retention_days/);
    expect(() => pickBackup(artifacts, 'yesterday')).toThrow(/isn't "latest"/);
  });
});

describe('site-info: setting NAMES only, never values', () => {
  const example = '# comment\nNEXT_PUBLIC_SUPABASE_URL=\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\n';

  it('reads names from .env.example', () => {
    expect(envExampleNames(example)).toEqual(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']);
  });

  it('records whether each secret is set without ever writing its value', () => {
    const text = settingsNames(example, { SUPABASE_DB_URL: 'postgresql://postgres.x:SUPERSECRET@host/db', BACKUP_PASSPHRASE: 'hunter2' });
    expect(text).toContain('- SUPABASE_DB_URL: set');
    expect(text).toContain('- SUPABASE_ACCESS_TOKEN: not set');
    expect(text).not.toContain('SUPERSECRET');
    expect(text).not.toContain('hunter2');
  });

  it('builds the deployment log from GitHub deployments', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      Response.json(
        url.includes('/statuses')
          ? [{ state: 'success', environment_url: 'https://my-app.vercel.app' }]
          : [{ id: 9, sha: 'abc123', created_at: '2026-10-07T10:00:00Z' }],
      ),
    );
    expect(await deployments({ repo: 'me/app', token: 't', fetchImpl })).toEqual([
      { commit: 'abc123', created_at: '2026-10-07T10:00:00Z', state: 'success', url: 'https://my-app.vercel.app' },
    ]);
    expect(fetchImpl.mock.calls[0][0]).toContain('environment=Production');
  });
});

describe('supabase-project', () => {
  const ref = 'abcdefghijklmnopqrst';

  it.each([
    ['Session pooler', `postgresql://postgres.${ref}:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres`],
    ['direct', `postgresql://postgres:pw@db.${ref}.supabase.co:5432/postgres`],
  ])('works out the project from a %s connection string', (_kind, url) => {
    expect(projectRef({ SUPABASE_DB_URL: url })).toBe(ref);
  });

  it('prefers SUPABASE_PROJECT_REF when set', () => {
    expect(projectRef({ SUPABASE_PROJECT_REF: 'zzzzzzzzzzzzzzzzzzzz', SUPABASE_DB_URL: 'x' })).toBe('zzzzzzzzzzzzzzzzzzzz');
  });

  it('picks the secret key, falling back to the legacy service_role key', async () => {
    const reply = (keys: object[]) => vi.fn(async () => Response.json(keys));
    expect(await secretKey(ref, 't', reply([{ type: 'publishable', api_key: 'p' }, { type: 'secret', api_key: 's' }]))).toBe('s');
    expect(await secretKey(ref, 't', reply([{ name: 'anon', api_key: 'a' }, { name: 'service_role', api_key: 'sr' }]))).toBe('sr');
    await expect(secretKey(ref, 't', vi.fn(async () => new Response('', { status: 401 })))).rejects.toThrow(/401/);
  });
});

const hasGpg = spawnSync('gpg', ['--version']).status === 0;

describe.skipIf(!hasGpg)('backup.sh → restore.sh (dry run, needs gpg)', () => {
  const root = resolve(__dirname, '..');
  let out: string;
  const run = (script: string, args: string[], env: Record<string, string> = {}) =>
    spawnSync('bash', [join(root, 'scripts/backup', script), ...args], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, SUPABASE_DB_URL: '', ...env },
    });

  afterEach(() => out && rmSync(out, { recursive: true, force: true }));

  it('creates an encrypted backup that restore can open, and never leaks the passphrase', () => {
    out = mkdtempSync(join(tmpdir(), 'bk-'));
    const backup = run('backup.sh', [out], { BACKUP_DRY_RUN: '1', BACKUP_PASSPHRASE: 'correct horse battery' });
    expect(backup.status, backup.stdout + backup.stderr).toBe(0);
    expect(existsSync(join(out, 'data.tar.gz.gpg'))).toBe(true);
    expect(JSON.parse(readFileSync(join(out, 'backup-info.json'), 'utf8'))).toMatchObject({ dry_run: true, tables: 1, files: 1 });
    expect(readFileSync(join(out, 'data.tar.gz.gpg')).includes('hello')).toBe(false); // encrypted, not plain
    expect(backup.stdout + backup.stderr).not.toContain('correct horse battery');

    const restore = run('restore.sh', [join(out, 'data.tar.gz.gpg'), '--confirm', 'RESTORE', '--dry-run'], {
      BACKUP_PASSPHRASE: 'correct horse battery',
    });
    expect(restore.status, restore.stdout + restore.stderr).toBe(0);
    expect(restore.stdout).toContain('Prepared data restore of 1 table(s): "public"."notes"');
  });

  it('refuses a wrong passphrase', () => {
    out = mkdtempSync(join(tmpdir(), 'bk-'));
    run('backup.sh', [out], { BACKUP_DRY_RUN: '1', BACKUP_PASSPHRASE: 'right' });
    const restore = run('restore.sh', [join(out, 'data.tar.gz.gpg'), '--confirm', 'RESTORE', '--dry-run'], { BACKUP_PASSPHRASE: 'wrong' });
    expect(restore.status).not.toBe(0);
  });

  it('refuses to save an unencrypted backup', () => {
    out = mkdtempSync(join(tmpdir(), 'bk-'));
    const backup = run('backup.sh', [out], { BACKUP_DRY_RUN: '1', BACKUP_PASSPHRASE: '' });
    expect(backup.status).toBe(1);
    expect(backup.stdout).toContain("BACKUP_PASSPHRASE is not set");
    expect(existsSync(join(out, 'data.tar.gz.gpg'))).toBe(false);
  });

  it.each([[[]], [['--confirm', 'restore']], [['--confirm', 'yes']], [['--confirm', 'RESTORE ']]])(
    'refuses to restore without the exact word RESTORE (%j)',
    (confirmArgs) => {
      const restore = run('restore.sh', ['whatever.gpg', ...confirmArgs], { BACKUP_PASSPHRASE: 'x' });
      expect(restore.status).toBe(2);
      expect(restore.stdout).toContain('type RESTORE');
    },
  );
});
