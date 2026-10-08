// Prepares the SQL files from a backup so they can be restored safely.
//
//   node scripts/backup/prepare-restore.mjs <backup-dir> <data|full>
//
// Writes <backup-dir>/restore/*.sql. Pure text processing — it never touches a database.
//
// Why filtering is needed: a Supabase data dump includes Supabase's own internal
// tables (e.g. the auth service's migration history). Restoring those could confuse
// Supabase, so only your data is restored: the `public` schema, any schemas your
// migrations created, and user accounts (`auth`). Stored files are restored separately
// through the Storage API (scripts/backup/storage.mjs), not through SQL.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Supabase-managed tables that must never be overwritten from a backup. */
export const SKIP_TABLES = new Set(['auth.schema_migrations']);

const COPY_LINE = /^COPY\s+("?)([^".\s]+)\1\.("?)([^"\s(]+)\3[\s(]/;
const SETVAL_LINE = /^SELECT pg_catalog\.setval\('("?)([^".]+)\1\./;

/** psql meta-commands added by newer pg_dump versions; older psql can't read them. */
export function stripMetaCommands(sql) {
  return sql
    .split('\n')
    .filter((line) => !/^\\(restrict|unrestrict)\b/.test(line))
    .join('\n');
}

/** Schemas created by your own migrations (from the schema dump), plus `public`. */
export function userSchemas(schemaSql) {
  const names = new Set(['public']);
  for (const [, name] of schemaSql.matchAll(/^CREATE SCHEMA (?:IF NOT EXISTS )?"?([^";\s]+)"?/gm)) {
    names.add(name);
  }
  return [...names];
}

/**
 * Keeps only COPY blocks (and sequence positions) for the given schemas.
 * Returns the filtered SQL and the list of restored tables ("schema"."table").
 */
export function filterData(dataSql, keepSchemas) {
  const keep = new Set(keepSchemas);
  const out = [];
  const tables = [];
  let skipping = false;

  for (const line of stripMetaCommands(dataSql).split('\n')) {
    if (skipping) {
      if (line === '\\.') skipping = false;
      continue;
    }
    const copy = COPY_LINE.exec(line);
    if (copy) {
      const [, , schema, , table] = copy;
      if (!keep.has(schema) || SKIP_TABLES.has(`${schema}.${table}`)) {
        skipping = true;
        continue;
      }
      tables.push(`"${schema}"."${table}"`);
    }
    const setval = SETVAL_LINE.exec(line);
    if (setval && !keep.has(setval[2])) continue;
    out.push(line);
  }
  return { sql: out.join('\n'), tables };
}

/**
 * Empties the tables that are about to be restored. DELETE (not TRUNCATE) so tables
 * that are not in the backup are never touched; foreign-key checks are switched off
 * for the restore session, so the order doesn't matter.
 */
export function clearTablesSql(tables) {
  return tables.map((t) => `DELETE FROM ${t};`).join('\n') + '\n';
}

/** Known fixes from Supabase's restore guide for restoring into a new project. */
export function fixRoles(rolesSql) {
  return stripMetaCommands(rolesSql).replace(/^(GRANT "?postgres"? TO "?cli_login_postgres"?.*)$/gm, '-- $1');
}
export function fixSchema(schemaSql) {
  return (
    stripMetaCommands(schemaSql)
      .replace(/^(ALTER .* OWNER TO "?supabase_admin"?;)$/gm, '-- $1')
      // A new project already has some objects; don't fail on them. Examples: the public
      // schema, and the function + event trigger behind Supabase's "automatic RLS" option.
      .replace(/^CREATE SCHEMA (?!IF NOT EXISTS )/gm, 'CREATE SCHEMA IF NOT EXISTS ')
      .replace(/^CREATE FUNCTION /gm, 'CREATE OR REPLACE FUNCTION ')
      .replace(/^CREATE EVENT TRIGGER "?([^"\s]+)"?([\s\S]*?);$/gm, (statement, name) =>
        [
          'DO $bumper_lanes$ BEGIN',
          `  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = '${name}') THEN`,
          `    EXECUTE $stmt$${statement.slice(0, -1)}$stmt$;`,
          '  END IF;',
          'END $bumper_lanes$;',
        ].join('\n'),
      )
  );
}

/** Writes the restore SQL files for the chosen mode. Returns the restored table list. */
export function prepareRestore(dir, mode) {
  const read = (f) => (existsSync(join(dir, 'db', f)) ? readFileSync(join(dir, 'db', f), 'utf8') : '');
  const schemaSql = read('schema.sql');
  const { sql, tables } = filterData(read('data.sql'), [...userSchemas(schemaSql), 'auth']);

  const out = join(dir, 'restore');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'data.sql'), sql);
  writeFileSync(join(out, 'clear.sql'), clearTablesSql(tables));
  if (mode === 'full') {
    writeFileSync(join(out, 'roles.sql'), fixRoles(read('roles.sql')));
    writeFileSync(join(out, 'schema.sql'), fixSchema(schemaSql));
    // Migration history: structure first, then rows.
    writeFileSync(
      join(out, 'migrations.sql'),
      fixSchema(read('migrations-schema.sql')) + '\n' + stripMetaCommands(read('migrations-data.sql')),
    );
  }
  return tables;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dir, mode] = process.argv.slice(2);
  if (!dir || !['data', 'full'].includes(mode)) {
    console.error('Usage: node scripts/backup/prepare-restore.mjs <backup-dir> <data|full>');
    process.exit(2);
  }
  const tables = prepareRestore(dir, mode);
  console.log(`Prepared ${mode} restore of ${tables.length} table(s): ${tables.join(', ') || '(none)'}`);
}
