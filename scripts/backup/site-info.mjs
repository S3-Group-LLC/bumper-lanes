// Live-site part of a backup (run by .github/workflows/backup.yml):
//   deployments.json — recent live-site deployments: commit, time, web address
//   settings-names.txt — the NAMES of the settings your project uses. Never values.
//
//   node scripts/backup/site-info.mjs <output-dir>
// Uses GITHUB_TOKEN and GITHUB_REPOSITORY (set automatically inside GitHub Actions).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Secrets the Bumper Lanes workflows use. Only whether each is set is recorded. */
export const WORKFLOW_SECRETS = ['SUPABASE_DB_URL', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_REF', 'BACKUP_PASSPHRASE'];

/** Setting names listed in .env.example (lines like NAME= or NAME=value). */
export function envExampleNames(text) {
  return [...text.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]);
}

/** Text listing setting names and whether each workflow secret is set. Never includes values. */
export function settingsNames(envExample, env = process.env) {
  const lines = ['# Setting NAMES only — values are never saved in backups.', '', '## App settings (.env.example → Vercel)'];
  lines.push(...envExampleNames(envExample).map((n) => `- ${n}`));
  lines.push('', '## GitHub Actions secrets');
  lines.push(...WORKFLOW_SECRETS.map((n) => `- ${n}: ${env[n] ? 'set' : 'not set'}`));
  return lines.join('\n') + '\n';
}

/** Recent production deployments recorded on GitHub (Vercel reports them there). */
export async function deployments({ repo, token, fetchImpl = fetch, limit = 30 }) {
  const api = (path) =>
    fetchImpl(`https://api.github.com/repos/${repo}/${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
    }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`GitHub API ${r.status} for ${path}`))));

  const list = await api(`deployments?environment=Production&per_page=${limit}`);
  const out = [];
  for (const d of list) {
    const [status] = await api(`deployments/${d.id}/statuses?per_page=1`);
    out.push({
      commit: d.sha,
      created_at: d.created_at,
      state: status?.state ?? 'unknown',
      url: status?.environment_url || status?.target_url || null,
    });
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/backup/site-info.mjs <output-dir>');
    process.exit(2);
  }
  mkdirSync(dir, { recursive: true });
  const envExample = existsSync('.env.example') ? readFileSync('.env.example', 'utf8') : '';
  writeFileSync(join(dir, 'settings-names.txt'), settingsNames(envExample));

  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  let list = [];
  if (repo && token) {
    try {
      list = await deployments({ repo, token });
    } catch (err) {
      console.log(`::warning::Couldn't read the deployment list: ${err.message}`);
    }
  }
  writeFileSync(join(dir, 'deployments.json'), JSON.stringify(list, null, 2) + '\n');
  console.log(`Live site: ${list.length} recent deployment(s) recorded; setting names saved.`);
}
