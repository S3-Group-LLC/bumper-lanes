// Is GitHub ready to apply database changes? Database changes need two GitHub secrets:
// SUPABASE_DB_URL (to reach the database) and BACKUP_PASSPHRASE (to back up first).
//
//   node scripts/db-ready.mjs migrate        — used by .github/workflows/migrate.yml
//   node scripts/db-ready.mjs pr <files.txt> — used by the Checks workflow on pull requests;
//                                              prints a warning to post, or nothing
import { existsSync, readFileSync, readdirSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NEEDED = ['SUPABASE_DB_URL', 'BACKUP_PASSPHRASE'];
export const MARKER = '<!-- bumper-lanes:db-not-ready -->';

export const missingSecrets = (env) => NEEDED.filter((n) => !env[n]?.trim());
export const isMigration = (path) => /^supabase\/migrations\/[^/]+\.sql$/.test(path);
/** Database changes that come with the kit itself (named …_bumper_lanes_….sql). */
export const isKitMigration = (path) => /_bumper_lanes_[^/]*\.sql$/.test(path);

const list = (names) => names.map((n) => `\`${n}\``).join(' and ');
const DOCTOR = 'ask your agent to run the doctor skill — it walks you through adding them';

/**
 * What the Database changes workflow should do. Without the secrets it can't apply
 * anything; that's only an error if there are changes of the learner's own waiting.
 * A brand-new copy of the kit (only the kit's own changes) gets a friendly note instead.
 */
export function migrateDecision(env, migrations) {
  const missing = missingSecrets(env);
  if (!missing.length) return { ready: true, level: 'ok', message: 'GitHub has what it needs to apply database changes.' };
  const own = migrations.filter((m) => !isKitMigration(m));
  if (!own.length) {
    return {
      ready: false,
      level: 'notice',
      message:
        `Database not connected yet, so nothing was applied — that's fine for now. Once ${list(missing)} ` +
        `are set (${DOCTOR}), run this workflow again: Actions → Database changes → Run workflow.`,
    };
  }
  return {
    ready: false,
    level: 'error',
    message:
      `Your database changes can't be applied yet: GitHub is missing the ${list(missing)} secret(s), ` +
      `so it can't back up first or reach the database. Nothing was changed. To fix it, ${DOCTOR}, ` +
      'then run this workflow again: Actions → Database changes → Run workflow.',
  };
}

/** The warning for a pull request that changes the database before it's connected. */
export function prWarning(env, changedFiles) {
  const migrations = changedFiles.filter(isMigration);
  const missing = missingSecrets(env);
  if (!migrations.length || !missing.length) return null;
  return [
    MARKER,
    "### ⚠️ Before you merge: your database isn't connected to GitHub yet",
    '',
    `This pull request changes your database (${migrations.map((m) => `\`${m}\``).join(', ')}), ` +
      `but GitHub is missing the ${list(missing)} secret(s) it needs to back up and apply it.`,
    '',
    "If you merge now, the code goes live but the database change won't be applied — pages that use it may not work.",
    '',
    `**What to do:** ${DOCTOR}. Then merge. (Already merged? Once the secrets are added, run **Actions → Database changes → Run workflow**.)`,
    '',
  ].join('\n');
}

function migrationsIn(root) {
  const dir = join(root, 'supabase', 'migrations');
  return existsSync(dir) ? readdirSync(dir).map((f) => `supabase/migrations/${f}`).filter(isMigration) : [];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, file] = process.argv.slice(2);
  const root = resolve(join(fileURLToPath(import.meta.url), '..', '..'));
  if (mode === 'migrate') {
    const d = migrateDecision(process.env, migrationsIn(root));
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `ready=${d.ready}\n`);
    if (process.env.GITHUB_STEP_SUMMARY && d.level !== 'ok') {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## ${d.level === 'error' ? '❌' : 'ℹ️'} Database changes\n\n${d.message}\n`);
    }
    console.log(d.level === 'ok' ? d.message : `::${d.level}::${d.message}`);
    process.exit(d.level === 'error' ? 1 : 0);
  } else if (mode === 'pr' && file) {
    const changed = readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
    const warning = prWarning(process.env, changed);
    if (warning) process.stdout.write(warning);
  } else {
    console.error('Usage: node scripts/db-ready.mjs migrate | pr <changed-files.txt>');
    process.exit(2);
  }
}
