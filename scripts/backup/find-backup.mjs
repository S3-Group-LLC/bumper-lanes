// Finds which saved backup to restore (run by .github/workflows/restore.yml).
//
//   node scripts/backup/find-backup.mjs <latest | YYYY-MM-DD | run-id>
//
// Prints `artifact=<name>` and `run_id=<id>` lines for $GITHUB_OUTPUT. Backups are
// GitHub Actions artifacts named backup-<date>-run<id>-<attempt>; they come from the
// nightly job, manual runs, and the safety backups taken before migrations and restores.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Data backups only (site-only backups are named backup-nodata-…). */
const isDataBackup = (a) => /^backup-\d{4}-\d{2}-\d{2}-run/.test(a.name) && !a.expired;

/**
 * Picks a backup from the repository's artifact list.
 * `excludeRunId` skips backups made by the current run (e.g. the safety backup a
 * restore takes of the current state just before restoring).
 */
export function pickBackup(artifacts, which = 'latest', excludeRunId = null) {
  const candidates = artifacts
    .filter(isDataBackup)
    .filter((a) => String(a.workflow_run?.id) !== String(excludeRunId))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  let match;
  if (which === 'latest') match = candidates[0];
  else if (/^\d{4}-\d{2}-\d{2}$/.test(which)) match = candidates.find((a) => a.created_at.startsWith(which));
  else if (/^\d+$/.test(which)) match = candidates.find((a) => String(a.workflow_run?.id) === which);
  else throw new Error(`"${which}" isn't "latest", a date like 2026-10-07, or a run ID.`);

  if (!match) {
    throw new Error(
      `No saved backup found for "${which}". Backups are kept for a limited number of days ` +
        '(see backups.retention_days in bumper-lanes.config.yaml).',
    );
  }
  return { artifact: match.name, runId: match.workflow_run.id, createdAt: match.created_at };
}

export async function listArtifacts({ repo, token, fetchImpl = fetch }) {
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetchImpl(`https://api.github.com/repos/${repo}/actions/artifacts?per_page=100&page=${page}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub API answered ${res.status}`);
    const { artifacts } = await res.json();
    all.push(...artifacts);
    if (artifacts.length < 100) break;
  }
  return all;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const artifacts = await listArtifacts({ repo: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN });
    const { artifact, runId, createdAt } = pickBackup(artifacts, process.argv[2] || 'latest', process.env.GITHUB_RUN_ID);
    console.error(`Restoring backup ${artifact} (saved ${createdAt}).`);
    console.log(`artifact=${artifact}`);
    console.log(`run_id=${runId}`);
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(1);
  }
}
