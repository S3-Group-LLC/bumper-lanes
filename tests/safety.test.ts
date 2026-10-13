import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkProject as checkRlsProject, exposedSchemas, findTablesWithoutRls, stripSql } from '../scripts/check-rls.mjs';
import { checkProject as checkSecretsProject, scanText } from '../scripts/check-secrets.mjs';

const root = resolve(__dirname, '..');
const m = (sql: string, file = '001.sql') => ({ file, sql });
const missing = (...migrations: { file: string; sql: string }[]) =>
  findTablesWithoutRls(migrations).map((t: { table: string }) => t.table);

describe('RLS check (GR-3)', () => {
  it('passes a correct migration', () => {
    expect(missing(m('create table public.todos (id int);\nalter table public.todos enable row level security;'))).toEqual([]);
  });

  it('fails a table without RLS', () => {
    expect(missing(m('create table todos (id int);'))).toEqual(['public.todos']);
  });

  it('handles several tables in one migration', () => {
    const sql = `
      create table public.a (id int);
      create table if not exists public.b (id int);
      create table c (id int);
      alter table public.a enable row level security;
      alter table only c enable row level security;`;
    expect(missing(m(sql))).toEqual(['public.b']);
  });

  it('handles quoted identifiers and mixed case', () => {
    const sql = `
      CREATE TABLE "public"."My Notes" (id int);
      CREATE TABLE "Public_Stuff" (id int);
      ALTER TABLE "public"."My Notes" ENABLE ROW LEVEL SECURITY;
      alter table public."Public_Stuff" enable row level security;`;
    expect(missing(m(sql))).toEqual([]);
    expect(missing(m('CREATE TABLE "Todos" (id int); ALTER TABLE todos ENABLE ROW LEVEL SECURITY;'))).toEqual(['public.Todos']);
  });

  it('follows tables across migrations: enable later, disable later, rename, drop', () => {
    expect(missing(m('create table t (id int);', '1.sql'), m('alter table t enable row level security;', '2.sql'))).toEqual([]);
    expect(
      missing(m('create table t (id int); alter table t enable row level security;', '1.sql'), m('alter table t disable row level security;', '2.sql')),
    ).toEqual(['public.t']);
    expect(missing(m('create table old (id int); alter table old enable row level security; alter table old rename to new;'))).toEqual([]);
    expect(missing(m('create table gone (id int);', '1.sql'), m('drop table if exists gone, other;', '2.sql'))).toEqual([]);
  });

  it('ignores schemas the API does not expose', () => {
    expect(missing(m('create schema private; create table private.audit (id int);'))).toEqual([]);
    expect(exposedSchemas('[api]\nenabled = true\nschemas = ["public", "graphql_public", "api"]\n')).toEqual(new Set(['public', 'graphql_public', 'api']));
    expect(findTablesWithoutRls([m('create table api.x (id int);')], exposedSchemas('[api]\nschemas = ["public", "api"]'))).toHaveLength(1);
  });

  it('ignores "create table" inside comments, strings and function bodies', () => {
    const sql = `
      -- create table commented_out (id int);
      /* create table block_comment (id int); */
      select 'create table in_a_string (id int)';
      create function f() returns void language plpgsql as $$ begin create table temp_in_fn (id int); end $$;`;
    expect(missing(m(sql))).toEqual([]);
    expect(stripSql("select 'it''s' -- note")).not.toContain('note');
  });

  it("passes this project's own migrations", () => {
    expect(checkRlsProject(root).missing).toEqual([]);
  });
});

// Fake secrets, built at runtime so this file never contains one.
const fake = {
  serviceRoleJwt: ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ role: 'service_role', iss: 'supabase' })).toString('base64url'), 'c2lnbmF0dXJlLXNpZ25hdHVyZQ'].join('.'),
  anonJwt: ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url'), 'c2lnbmF0dXJlLXNpZ25hdHVyZQ'].join('.'),
  sbSecret: 'sb_' + 'secret_' + 'A1b2C3d4E5f6G7h8I9j0K1l2',
  sbAccessToken: 'sbp_' + 'a1'.repeat(20),
  anthropic: 'sk-' + 'ant-api03-' + 'x'.repeat(40),
  openai: 'sk-' + 'proj-' + 'Y'.repeat(40),
  resend: 're_' + 'AbCd1234' + '_' + 'EfGh5678IjKl9012MnOp',
  github: 'gh' + 'p_' + 'Z'.repeat(36),
  privateKey: '-----BEGIN ' + 'PRIVATE KEY-----',
  dbUrl: 'postgresql://postgres.abcdefghijklmnopqrst:' + 'Real-Pa55word-123' + '@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
};
const kinds = (text: string) => scanText(text).map((f: { kind: string }) => f.kind);

describe('secret check (GR-4)', () => {
  it.each([
    ['a fake service-role key', `const key = "${fake.serviceRoleJwt}";`, 'Supabase service-role key (JWT)'],
    ['an old-style anon key (still not for code)', `KEY=${fake.anonJwt}`, 'JWT token'],
    ['a Supabase secret key', `SUPABASE_KEY=${fake.sbSecret}`, 'Supabase secret key'],
    ['a Supabase access token', fake.sbAccessToken, 'Supabase access token'],
    ['an Anthropic key', fake.anthropic, 'Anthropic API key'],
    ['an OpenAI key', fake.openai, 'OpenAI API key'],
    ['a Resend key', fake.resend, 'Resend API key'],
    ['a GitHub token', fake.github, 'GitHub token'],
    ['a private key', fake.privateKey, 'Private key'],
    ['a database password', fake.dbUrl, 'Database connection string with password'],
  ])('finds %s', (_label, text, kind) => {
    expect(kinds(text)).toContain(kind);
  });

  it('does not flag safe things', () => {
    expect(
      scanText(
        [
          'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_abc123def456ghi789',
          'postgresql://postgres:[YOUR-PASSWORD]@db.abcdefghijklmnopqrst.supabase.co:5432/postgres',
          'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
          'const ask = "sk-learn-more-about-keys";',
          're_render_count_total',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('honours the allow marker for intentional test fixtures', () => {
    expect(scanText(`${fake.sbSecret} // bumper-lanes:allow-secret`)).toEqual([]);
  });

  describe('whole project', () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'secrets-'));
      writeFileSync(join(dir, '.gitignore'), 'node_modules\n.env*\n!.env.example\n');
      writeFileSync(join(dir, '.env.example'), 'NEXT_PUBLIC_SUPABASE_URL=\n');
      mkdirSync(join(dir, 'src'));
      writeFileSync(join(dir, 'src', 'page.tsx'), 'export default function Page() { return null; }\n');
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('passes a clean project', () => {
      expect(checkSecretsProject(dir).problems).toEqual([]);
    });

    it('fails a project with a fake service-role key, pointing at the file and line', () => {
      writeFileSync(join(dir, 'src', 'admin.ts'), `// admin\nconst k = "${fake.serviceRoleJwt}";\n`);
      expect(checkSecretsProject(dir).problems).toMatchObject([
        { file: 'src/admin.ts', line: 2, kind: 'Supabase service-role key (JWT)' },
      ]);
    });

    it('fails when a .env file would be committed, or .env is not ignored', () => {
      writeFileSync(join(dir, '.env.local'), 'X=1\n');
      writeFileSync(join(dir, '.gitignore'), 'node_modules\n');
      const kindsFound = checkSecretsProject(dir).problems.map((p: { kind: string }) => p.kind);
      expect(kindsFound).toContain('".env.local" file would be committed');
      expect(kindsFound).toContain('.env files are not ignored');
    });
  });

  it("passes this project's own files", () => {
    expect(checkSecretsProject(root).problems).toEqual([]);
  });
});

// The rules are safe defaults; the learner can overrule them.
describe('AGENTS.md — the learner is in charge', () => {
  const agents = readFileSync(resolve(__dirname, '..', 'AGENTS.md'), 'utf8');

  it('lets the learner overrule a rule: warn once, ask once, do it, log it', () => {
    expect(agents).toMatch(/## The learner is in charge/);
    expect(agents).toMatch(/They can overrule any rule here/);
    expect(agents).toMatch(/Ask once: "Want me to go ahead anyway\?"/);
    expect(agents).toMatch(/Don't argue or\s+ask again/);
    expect(agents).toMatch(/Note it in `CHANGELOG\.md`/);
  });

  it('offers to change AGENTS.md for good, through a pull request', () => {
    expect(agents).toMatch(/offer to edit\s+this file — through a pull request/);
  });

  it('no longer tells the agent to refuse', () => {
    expect(agents).not.toMatch(/even if asked/i);
    for (const name of readdirSync(resolve(__dirname, '..', '.agents/skills'))) {
      const skillText = readFileSync(resolve(__dirname, '..', '.agents/skills', name, 'SKILL.md'), 'utf8');
      expect(skillText, name).not.toMatch(/even if (asked|they ask)/i);
    }
  });

  it('keeps confirmation words for the learner to type', () => {
    expect(agents).toMatch(/`RESTORE` are always typed by the learner, never by you/);
  });

  it('stays short enough to read every session', () => {
    expect(agents.split('\n').length).toBeLessThanOrEqual(155);
  });
});
