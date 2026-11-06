// Did the backup cover everything? Run last by the Backup workflow. The backup is already
// saved by then (your database is safe); this makes the run fail — with the reason — if
// stored files were left out, so a half-done backup never looks like a green ✓.
//
//   node scripts/backup/check-complete.mjs <backup-info.json>
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Plain-English reason the backup is incomplete, or null if it's complete. */
export function incompleteReason(info, env = process.env) {
  if (!info || info.dry_run) return null;
  if (info.files_included) return null;
  return (
    env.STORAGE_PROBLEM ||
    info.storage_error ||
    "Stored files weren't backed up. Ask your agent to run doctor."
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  const info = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const reason = incompleteReason(info);
  if (reason) {
    console.log(`::error title=Backup incomplete::Your database was saved, but ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`);
    process.exit(1);
  }
  console.log('Everything was backed up.');
}
