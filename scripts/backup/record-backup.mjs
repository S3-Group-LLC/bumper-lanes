// Records a finished backup in your database, so your site's /status page can show
// when the last one ran and what it covered (table bumper_lanes.backup_runs, created by
// supabase/migrations/20261012000000_bumper_lanes_backup_status.sql).
//
//   node scripts/backup/record-backup.mjs <backup-info.json>
//
// Run by the Backup and Database changes workflows after a backup is saved. Needs
// SUPABASE_DB_URL and psql. Never fails the workflow: if it can't record, it says why.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SQL = `insert into bumper_lanes.backup_runs (run_id, created_at, database, files, code, tables, file_count)
values (:'run_id', :'created_at', :'database', :'files', :'code', :'tables', :'file_count')
on conflict (run_id) do nothing;
`;

/**
 * The row to record, from backup-info.json (written by backup.sh). Returns null for a
 * dry run (sample data — nothing real to report).
 */
export function recordValues(info, env = process.env) {
  if (info.dry_run) return null;
  const created = new Date(info.created_at);
  if (Number.isNaN(created.getTime())) throw new Error('backup-info.json has no valid created_at');
  const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);
  return {
    // The same run records once, even if two jobs report it (backup, then migrate).
    run_id: env.GITHUB_RUN_ID ? `${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT ?? 1}` : `local-${created.toISOString()}`,
    created_at: created.toISOString(),
    database: String(info.database !== false),
    files: String(info.files_included === true),
    code: String(Boolean(info.code_tag)),
    tables: String(count(info.tables)),
    file_count: String(count(info.files)),
  };
}

/** Turns a psql error into a plain-English reason. */
export function explainRecordError(stderr) {
  if (/(relation|schema) "?bumper_lanes(\.backup_runs)?"? does not exist/.test(stderr)) {
    return (
      "the kit's database setup hasn't been applied yet (normal before the first database change). " +
      'On GitHub: Actions → Database changes → Run workflow, or ask your agent to run doctor.'
    );
  }
  const first = stderr.split('\n').find((l) => /error|fatal/i.test(l)) ?? stderr.split('\n')[0] ?? '';
  return `the database said: ${first.replace(/^psql:\s*/, '').trim() || 'unknown error'}`;
}

function warn(message) {
  if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Backup status not recorded::${message}`);
  else console.log(`[backup status] Not recorded: ${message}`);
}

export function main(file) {
  if (!process.env.SUPABASE_DB_URL) return warn('SUPABASE_DB_URL is not set.');
  if (!file || !existsSync(file)) return warn(`no backup details found (${file ?? 'no file given'}).`);
  const values = recordValues(JSON.parse(readFileSync(file, 'utf8')));
  if (!values) return console.log('[backup status] Dry run — nothing recorded.');

  const vars = Object.entries(values).flatMap(([k, v]) => ['--set', `${k}=${v}`]);
  const run = spawnSync(
    'psql',
    ['--no-psqlrc', '--quiet', '--set', 'ON_ERROR_STOP=1', ...vars, '--dbname', process.env.SUPABASE_DB_URL],
    { input: SQL, encoding: 'utf8' },
  );
  if (run.error) return warn(`psql isn't available (${run.error.message}).`);
  if (run.status !== 0) return warn(explainRecordError(run.stderr ?? ''));
  console.log(`[backup status] Recorded the backup from ${values.created_at} for your site's /status page.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]);
}
