// Checks the parts of your setup that can be checked from inside this project
// (used by the doctor skill). Prints a plain-English checklist.
//
//   node scripts/doctor.mjs          (or: npm run doctor)
//
// Things that live outside the project — GitHub secrets, Vercel settings, whether
// Supabase is awake — are checked by the doctor skill itself, or with click-by-click steps.
// In the cloud it also tests which websites your agent can reach (cloud-check.mjs).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { checkProject as checkSkills } from './check-skills.mjs';
import { checkProject as checkRls } from './check-rls.mjs';
import { checkProject as checkSecrets } from './check-secrets.mjs';
import { supabaseSettingProblems } from '../src/lib/supabase-settings.mjs';
import { SECRETS, existingSecrets, secretIsSet } from './connect-backups.mjs';
import { networkCheck, placeCheck, toolsCheck, whereAmIWorking } from './cloud-check.mjs';

const ok = (title, detail = '') => ({ status: 'ok', title, detail });
const warn = (title, detail, fix) => ({ status: 'warn', title, detail, fix });
const fail = (title, detail, fix) => ({ status: 'fail', title, detail, fix });

/** Validates bumper-lanes.config.yaml. Returns a list of problems (empty = fine). */
export function configProblems(text) {
  let config;
  try {
    config = parse(text) ?? {};
  } catch (err) {
    return [`it isn't valid YAML (${err.message.split('\n')[0]})`];
  }
  const problems = [];
  if (!['prod-only', 'dev-and-prod'].includes(config.environment)) {
    problems.push(`"environment" should be prod-only (got ${JSON.stringify(config.environment)})`);
  }
  if (!['claude-code', 'codex'].includes(config.agent)) {
    problems.push(`"agent" should be claude-code or codex (got ${JSON.stringify(config.agent)})`);
  }
  const days = config.backups?.retention_days;
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    problems.push(`"backups.retention_days" should be a whole number from 1 to 90 (got ${JSON.stringify(days)})`);
  }
  return problems;
}

/** Is PROJECT.md still the placeholder? */
export function projectIsPlaceholder(text) {
  return /run `start-my-project`/.test(text) || !/^##\s/m.test(text);
}

function git(root, ...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/** Are backups switched on? Uses the GitHub CLI if it's signed in (names only, never values). */
export function backupCheck(have) {
  if (!have) {
    return {
      status: 'check',
      title: 'Backups',
      detail: "can't see the GitHub secrets from here",
      fix: 'Ask the learner to look at GitHub → Actions → Backup (the doctor skill explains), or run: npm run connect-backups -- --check',
    };
  }
  const missing = SECRETS.filter((n) => !secretIsSet(have, n));
  return missing.length
    ? warn('Backups', `not switched on yet (missing ${missing.join(', ')})`, 'Takes about 5 minutes: run npm run connect-backups (or ask: "connect backups").')
    : ok('Backups', 'switched on (the GitHub secrets are set)');
}

const hasTool = (name) => spawnSync('sh', ['-c', `command -v ${name}`], { stdio: 'ignore' }).status === 0;

export function runChecks(root, env = process.env, { listSecrets = () => existingSecrets(undefined, root) } = {}) {
  const results = [];
  const read = (f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : null);

  // Where, and tools
  const place = whereAmIWorking(env);
  results.push(placeCheck(place));
  const [major, minor] = process.versions.node.split('.').map(Number);
  results.push(
    major > 20 || (major === 20 && minor >= 9)
      ? ok('Node.js version', `v${process.versions.node}`)
      : fail('Node.js version', `v${process.versions.node} is too old (needs 20.9 or newer)`, 'Run: bash scripts/setup.sh'),
  );
  const lock = read('package-lock.json');
  const stamp = read('node_modules/.bumper-lanes-lock');
  results.push(
    lock && stamp === lock
      ? ok('Project set up', 'dependencies are installed')
      : fail('Project set up', 'dependencies are missing or out of date', 'Run: bash scripts/setup.sh'),
  );

  // Settings files
  const config = read('bumper-lanes.config.yaml');
  const problems = config === null ? ['the file is missing'] : configProblems(config);
  results.push(
    problems.length
      ? fail('bumper-lanes.config.yaml', problems.join('; '), 'Fix the file (see the comments in it), or ask your agent to.')
      : ok('bumper-lanes.config.yaml', 'settings look right'),
  );
  const envExample = read('.env.example') ?? '';
  const missingNames = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'].filter((n) => !envExample.includes(n));
  results.push(
    missingNames.length
      ? warn('.env.example', `doesn't list ${missingNames.join(', ')}`, 'Add the missing names (names only, never values).')
      : ok('.env.example', 'lists the settings the app needs'),
  );
  const project = read('PROJECT.md');
  results.push(
    project && !projectIsPlaceholder(project)
      ? ok('PROJECT.md', 'your idea is written down')
      : warn('PROJECT.md', 'still the placeholder', 'Ask your agent: "run start-my-project".'),
  );

  // Safety
  const skills = checkSkills(root);
  results.push(
    skills.problems.length
      ? fail('Skills', skills.problems[0], 'Run: npm run sync:skills, then npm run check:skills')
      : ok('Skills', `${skills.skills.length} skills, visible to both Claude Code and Codex`),
  );
  const rls = checkRls(root);
  results.push(
    rls.missing.length
      ? fail('Row Level Security', `${rls.missing.map((m) => m.table).join(', ')} without RLS`, 'Run: npm run check:rls for the exact fix.')
      : ok('Row Level Security', `on for every table (${rls.files} database change file(s))`),
  );
  const secrets = checkSecrets(root);
  results.push(
    secrets.problems.length
      ? fail('No secrets in files', `${secrets.problems.length} possible secret(s), e.g. ${secrets.problems[0].file}`, 'Run: npm run check:secrets for details and what to do.')
      : ok('No secrets in files', `${secrets.files} files checked`),
  );

  // Git
  const branch = git(root, 'rev-parse', '--abbrev-ref', 'HEAD');
  const dirty = git(root, 'status', '--porcelain');
  if (branch === null) results.push(warn('Git', 'this folder is not a git repository', 'Open the project from GitHub in Claude Code or Codex.'));
  else if (branch === 'main' && dirty) {
    results.push(warn('Working on main', 'there are unsaved changes directly on main (the live site)', 'Move them to a branch and use ship-it to open a pull request.'));
  } else results.push(ok('Git', `on branch ${branch}`));

  if (!place.endsWith('local')) results.push(toolsCheck(hasTool));
  results.push(backupCheck(listSecrets()));

  // Supabase settings as seen from here (usually not set inside an agent's workspace)
  // Same names the app reads (src/lib/health.ts).
  const hasUrl = Boolean(env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  const hasKey = Boolean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());
  const settingProblems = supabaseSettingProblems(env);
  results.push(
    settingProblems.length
      ? fail('Supabase settings for the app', settingProblems.join(' '), 'Fix them where they are set (Vercel → Settings → Environment Variables, or .env.local), then redeploy.')
      : !hasUrl || !hasKey
      ? {
          status: 'check',
          title: 'Supabase settings for the app',
          detail:
            "not visible from here (normal — they live in Vercel, and the Supabase integration marks them Sensitive, so nobody can read them back)",
          fix: 'Open your live site\'s /status page to check them (the doctor skill explains how).',
        }
      : ok('Supabase settings for the app', 'set in this workspace'),
  );
  return results;
}

const ICON = { ok: '✓', warn: '⚠', fail: '✗', check: '?' };

export function formatReport(results) {
  const lines = results.map((r) => {
    const head = `${ICON[r.status]} ${r.title}${r.detail ? ` — ${r.detail}` : ''}`;
    return r.fix && r.status !== 'ok' ? `${head}\n    → ${r.fix}` : head;
  });
  const counts = results.reduce((c, r) => ({ ...c, [r.status]: (c[r.status] ?? 0) + 1 }), {});
  lines.push('', `${counts.ok ?? 0} OK · ${counts.warn ?? 0} to look at · ${counts.fail ?? 0} to fix · ${counts.check ?? 0} to check outside the project`);
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? join(fileURLToPath(import.meta.url), '..', '..'));
  const results = runChecks(root);
  // In the cloud (or unsure), test which websites the agent can reach.
  const place = whereAmIWorking();
  if (!place.endsWith('local')) results.push(await networkCheck(place));
  console.log(formatReport(results));
}
