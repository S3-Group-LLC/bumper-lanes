// Row Level Security check (run: npm run check:rls). Guard rail GR-3.
//
// Every table your app can reach through Supabase's API must have Row Level
// Security (RLS) switched on — otherwise anyone with your publishable key could
// read or change every row. This reads your migration files in order and fails if
// any table in an API-exposed schema ends up without RLS.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Removes comments, string literals and $$-quoted bodies so only real statements remain. */
export function stripSql(sql) {
  return sql
    .replace(/\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1\$/g, ' ') // function bodies: $$…$$ / $tag$…$tag$
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''");
}

const IDENT = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*)`;
const NAME = String.raw`(${IDENT})(?:\s*\.\s*(${IDENT}))?`;

/** "Public"."My Table" → public."My Table"-style key: schema.table, quotes removed, unquoted lowercased. */
function normalise(first, second) {
  const clean = (id) => (id.startsWith('"') ? id.slice(1, -1).replace(/""/g, '"') : id.toLowerCase());
  return second ? `${clean(first)}.${clean(second)}` : `public.${clean(first)}`;
}

/** Schemas Supabase exposes through its API (supabase/config.toml [api] schemas). */
export function exposedSchemas(configToml) {
  const api = /^\[api\][\s\S]*?^schemas\s*=\s*\[([^\]]*)\]/m.exec(configToml ?? '');
  const list = api ? [...api[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
  return new Set(list.length ? list : ['public']);
}

/**
 * Replays migrations in order and returns tables in exposed schemas whose final state
 * has RLS off: [{ table, file }].
 */
export function findTablesWithoutRls(migrations, schemas = new Set(['public'])) {
  const tables = new Map(); // key → { file, rls }
  const rx = {
    create: new RegExp(String.raw`\bcreate\s+(?:(?:global|local)\s+)?(?:(?:temp|temporary|unlogged)\s+)?table\s+(?:if\s+not\s+exists\s+)?${NAME}`, 'gi'),
    alter: new RegExp(String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${NAME}\s+(enable|disable|force|no\s+force)\s+row\s+level\s+security`, 'gi'),
    rename: new RegExp(String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${NAME}\s+rename\s+to\s+(${IDENT})`, 'gi'),
    drop: new RegExp(String.raw`\bdrop\s+table\s+(?:if\s+exists\s+)?((?:${IDENT}(?:\s*\.\s*${IDENT})?\s*,?\s*)+)`, 'gi'),
  };

  for (const { file, sql } of migrations) {
    const text = stripSql(sql);
    const events = [];
    for (const m of text.matchAll(rx.create)) {
      events.push({ at: m.index, kind: 'create', key: normalise(m[1], m[2]) });
    }
    for (const m of text.matchAll(rx.alter)) {
      events.push({ at: m.index, kind: m[3].toLowerCase() === 'disable' ? 'off' : 'on', key: normalise(m[1], m[2]) });
    }
    for (const m of text.matchAll(rx.rename)) {
      const from = normalise(m[1], m[2]);
      const to = `${from.split('.')[0]}.${normalise(m[3]).split('.')[1]}`;
      events.push({ at: m.index, kind: 'rename', key: from, to });
    }
    for (const m of text.matchAll(rx.drop)) {
      for (const part of m[1].split(',')) {
        const n = new RegExp(`^\\s*${NAME}\\s*$`).exec(part);
        if (n) events.push({ at: m.index, kind: 'drop', key: normalise(n[1], n[2]) });
      }
    }
    events.sort((a, b) => a.at - b.at);

    for (const e of events) {
      if (e.kind === 'create') tables.set(e.key, { file, rls: false });
      else if (e.kind === 'drop') tables.delete(e.key);
      else if (e.kind === 'rename' && tables.has(e.key)) {
        tables.set(e.to, tables.get(e.key));
        tables.delete(e.key);
      } else if ((e.kind === 'on' || e.kind === 'off') && tables.has(e.key)) {
        tables.get(e.key).rls = e.kind === 'on';
      }
    }
  }

  return [...tables]
    .filter(([key, t]) => !t.rls && schemas.has(key.split('.')[0]))
    .map(([table, t]) => ({ table, file: t.file }));
}

export function checkProject(root) {
  const dir = join(root, 'supabase', 'migrations');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.sql')).sort() : [];
  const migrations = files.map((f) => ({ file: `supabase/migrations/${f}`, sql: readFileSync(join(dir, f), 'utf8') }));
  const config = existsSync(join(root, 'supabase', 'config.toml')) ? readFileSync(join(root, 'supabase', 'config.toml'), 'utf8') : '';
  return { files: files.length, missing: findTablesWithoutRls(migrations, exposedSchemas(config)) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? join(fileURLToPath(import.meta.url), '..', '..'));
  const { files, missing } = checkProject(root);
  if (missing.length) {
    console.error(`✗ ${missing.length} table(s) without Row Level Security — anyone could read or change their rows:`);
    for (const { table, file } of missing) {
      const [schema, name] = table.split('.');
      console.error(`  - ${table} (created in ${file})`);
      console.error(`    Fix: add to a migration →  alter table "${schema}"."${name}" enable row level security;`);
      console.error('         …then add policies saying who may read/write (the add-data skill does this).');
    }
    process.exit(1);
  }
  console.log(`✓ Row Level Security is on for every table (${files} migration file(s) checked).`);
}
