#!/usr/bin/env bash
# Restores your data from an encrypted backup. Normally run by .github/workflows/restore.yml.
#
#   bash scripts/backup/restore.sh <data.tar.gz.gpg> --confirm RESTORE [--mode data|full] [--dry-run]
#
#   --mode data  (default) Put rows and files back into your EXISTING project, as they were
#                at backup time. Tables keep today's structure. Rows in the backed-up tables
#                are replaced; tables that didn't exist at backup time are not touched.
#   --mode full  Rebuild everything (roles, structure, rows, files) in a NEW, EMPTY project.
#   --dry-run    Decrypt and prepare, but don't change any database or files.
#
# Settings: BACKUP_PASSPHRASE, SUPABASE_DB_URL, and SUPABASE_URL + SUPABASE_SECRET_KEY for files.
set -euo pipefail

say() { printf '[restore] %s\n' "$*"; }
file="" confirm="" mode="data" dry=0
while [ $# -gt 0 ]; do
  case "$1" in
    --confirm) confirm="${2:-}"; shift 2 ;;
    --mode) mode="${2:-}"; shift 2 ;;
    --dry-run) dry=1; shift ;;
    *) file="$1"; shift ;;
  esac
done

# Typed confirmation comes first, before anything is decrypted or touched (guard rail GR-6).
if [ "$confirm" != "RESTORE" ]; then
  say "Stopped: restoring replaces data, so you must type RESTORE (all capitals) to confirm."
  exit 2
fi
if [ "$mode" != "data" ] && [ "$mode" != "full" ]; then
  say "Stopped: --mode must be 'data' or 'full'."
  exit 2
fi
[ -f "$file" ] || { say "Stopped: backup file not found: ${file:-<none>}"; exit 2; }
[ -n "${BACKUP_PASSPHRASE:-}" ] || { say "Stopped: BACKUP_PASSPHRASE is not set."; exit 2; }
if [ "$dry" -eq 0 ] && [ -z "${SUPABASE_DB_URL:-}" ]; then
  say "Stopped: SUPABASE_DB_URL is not set."
  exit 2
fi

here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

say "Decrypting backup…"
gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 -d "$file" 3<<<"$BACKUP_PASSPHRASE" |
  tar -xzf - -C "$work"

node "$here/prepare-restore.mjs" "$work" "$mode"

if [ "$dry" -eq 1 ]; then
  say "Dry run: backup opened and prepared. No database or files were changed."
  exit 0
fi

# One transaction: if anything fails, nothing is changed.
# session_replication_role = replica switches off triggers and foreign-key checks
# during the restore, as Supabase's restore guide recommends.
psql_args=(--no-psqlrc --quiet --single-transaction --variable ON_ERROR_STOP=1 --output /dev/null
  --dbname "$SUPABASE_DB_URL")
failed() {
  say "Nothing was changed: the restore stopped at the error above and was rolled back."
  say "Common causes: a table in the backup was removed or renamed since, or (full mode) the"
  say "target project isn't empty. Ask your agent to run the restore skill for help."
  exit 1
}
if [ "$mode" = "full" ]; then
  # Custom roles first, on their own: some lines copy settings of Supabase's built-in
  # roles, which a new project won't allow. Those are skipped; your roles are created.
  say "Restoring custom database roles (settings of Supabase's built-in roles are skipped)…"
  psql --no-psqlrc --quiet --output /dev/null --variable ON_ERROR_STOP=0 --dbname "$SUPABASE_DB_URL" \
    --file "$work/restore/roles.sql" 2>&1 | sed 's/^/  (skipped) /' || true
  say "Restoring structure and rows into the new project…"
  psql "${psql_args[@]}" \
    --file "$work/restore/schema.sql" \
    --command 'SET session_replication_role = replica' \
    --file "$work/restore/clear.sql" \
    --file "$work/restore/data.sql" \
    --file "$work/restore/migrations.sql" || failed
else
  say "Replacing rows with the backed-up rows…"
  psql "${psql_args[@]}" \
    --command 'SET session_replication_role = replica' \
    --file "$work/restore/clear.sql" \
    --file "$work/restore/data.sql" || failed
fi

if [ -f "$work/storage/files.json" ]; then
  if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SECRET_KEY:-}" ]; then
    say "Putting stored files back…"
    node "$here/storage.mjs" upload "$work/storage"
  else
    say "WARNING: the backup has stored files, but SUPABASE_URL / SUPABASE_SECRET_KEY are not set, so files were NOT restored."
    exit 1
  fi
fi
say "Restore complete."
