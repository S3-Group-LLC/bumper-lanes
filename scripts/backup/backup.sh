#!/usr/bin/env bash
# Backs up your data: database (roles, structure, rows) + stored files, then
# compresses and encrypts it. Normally run by .github/workflows/backup.yml.
#
#   bash scripts/backup/backup.sh <output-dir>
#
# Settings (environment variables — the workflow fills these from GitHub secrets):
#   SUPABASE_DB_URL      database connection string (Session pooler)       — required
#   BACKUP_PASSPHRASE    password used to encrypt the backup               — required
#   SUPABASE_URL + SUPABASE_SECRET_KEY   needed to back up stored files (without them, or
#                        if they're rejected, the database is still saved and
#                        backup-info.json says why files were left out)
#   BACKUP_DRY_RUN=1     no database needed: backs up sample data instead (for tests)
#   BACKUP_CODE_TAG      the code tag made by the workflow, noted in backup-info.json — optional
#
# Writes <output-dir>/data.tar.gz.gpg and <output-dir>/backup-info.json.
# Never prints secret values.
set -euo pipefail

out="${1:?Usage: backup.sh <output-dir>}"
here="$(cd "$(dirname "$0")" && pwd)"
say() { printf '[backup] %s\n' "$*"; }

if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  say "ERROR: BACKUP_PASSPHRASE is not set, so the backup can't be encrypted. Nothing was saved."
  exit 1
fi
if [ "${BACKUP_DRY_RUN:-}" != "1" ] && [ -z "${SUPABASE_DB_URL:-}" ]; then
  say "ERROR: SUPABASE_DB_URL is not set."
  exit 1
fi

mkdir -p "$out"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/db" "$work/storage"

# 1. Database ------------------------------------------------------------------
if [ "${BACKUP_DRY_RUN:-}" = "1" ]; then
  say "Dry run: using sample data instead of a real database."
  printf -- '-- sample roles\n' > "$work/db/roles.sql"
  printf 'CREATE TABLE IF NOT EXISTS "public"."notes" ("id" integer PRIMARY KEY, "body" text);\n' > "$work/db/schema.sql"
  printf 'COPY "public"."notes" ("id", "body") FROM stdin;\n1\thello\n\\.\n' > "$work/db/data.sql"
else
  say "Saving database roles, structure and rows…"
  # Supabase's recommended commands (supabase.com/docs/guides/deployment/ci/backups).
  if ! supabase db dump --db-url "$SUPABASE_DB_URL" -f "$work/db/roles.sql" --role-only; then
    say "ERROR: couldn't connect to your database with SUPABASE_DB_URL. It must be the Session"
    say "pooler connection string (Supabase → Connect → Session pooler) with your database password"
    say "filled in. If the project is paused, open it in Supabase to wake it up. Nothing was saved."
    exit 1
  fi
  supabase db dump --db-url "$SUPABASE_DB_URL" -f "$work/db/schema.sql"
  supabase db dump --db-url "$SUPABASE_DB_URL" -f "$work/db/data.sql" --use-copy --data-only \
    -x "storage.buckets_vectors" -x "storage.vector_indexes"
  # Migration history (structure + rows), so a full restore knows which migrations
  # were already applied. A project with no migrations yet has no such schema — fine.
  dump_migrations() { # <file> <extra flags…>
    local file="$1" log
    shift
    log="$(mktemp)"
    if supabase db dump --db-url "$SUPABASE_DB_URL" -f "$file" -s supabase_migrations "$@" > "$log" 2>&1; then
      cat "$log"
    elif grep -q 'no matching schemas' "$log"; then
      : > "$file"
    else
      cat "$log" >&2
      return 1
    fi
  }
  dump_migrations "$work/db/migrations-schema.sql"
  dump_migrations "$work/db/migrations-data.sql" --use-copy --data-only
  [ -s "$work/db/migrations-schema.sql" ] || say "No migration history yet (normal before your first database change)."
fi

# 2. Stored files --------------------------------------------------------------
files=0 files_included=false storage_error=""
if [ "${BACKUP_DRY_RUN:-}" = "1" ]; then
  mkdir -p "$work/storage/files/sample"
  printf 'sample file\n' > "$work/storage/files/sample/hello.txt"
  printf '[{"name":"sample","public":false,"file_size_limit":null,"allowed_mime_types":null}]\n' > "$work/storage/buckets.json"
  printf '[{"bucket":"sample","path":"hello.txt","mimetype":"text/plain"}]\n' > "$work/storage/files.json"
  files=1 files_included=true
elif [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SECRET_KEY:-}" ]; then
  say "Saving stored files…"
  if storage_log="$(node "$here/storage.mjs" download "$work/storage" 2>&1)"; then
    echo "$storage_log"
    files="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).length)' "$work/storage/files.json")"
    files_included=true
  else
    # Keep going: the database is still worth saving. The workflow fails at the end.
    storage_error="$(printf '%s' "$storage_log" | tail -1)"
    say "WARNING: stored files were NOT backed up — $storage_error"
    rm -rf "$work/storage" && mkdir -p "$work/storage"
  fi
else
  say "Stored files skipped: SUPABASE_URL / SUPABASE_SECRET_KEY not available."
fi

# 3. Compress + encrypt ----------------------------------------------------------
tables="$(grep -c '^COPY ' "$work/db/data.sql" || true)"
say "Encrypting ($tables table(s), $files file(s))…"
# The passphrase goes in on a private file descriptor, never on the command line.
tar -czf - -C "$work" db storage |
  gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 \
    --symmetric --cipher-algo AES256 -o "$out/data.tar.gz.gpg" 3<<<"$BACKUP_PASSPHRASE"

# Prove the backup can be opened again before calling it done.
gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 -d "$out/data.tar.gz.gpg" 3<<<"$BACKUP_PASSPHRASE" |
  tar -tzf - > /dev/null

bytes="$(wc -c < "$out/data.tar.gz.gpg" | tr -d ' ')"
cat > "$out/backup-info.json" <<EOF
{
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "commit": "$(git rev-parse HEAD 2>/dev/null || echo unknown)",
  "dry_run": $([ "${BACKUP_DRY_RUN:-}" = "1" ] && echo true || echo false),
  "database": true,
  "tables": $tables,
  "files_included": $files_included,
  "files": $files,
  "code_tag": "$(printf '%s' "${BACKUP_CODE_TAG:-}" | tr -cd 'A-Za-z0-9/._-')",
  "storage_error": "$(printf '%s' "$storage_error" | tr -d '"\\' | tr '\n\t' '  ' | cut -c1-300)",
  "encrypted_bytes": $bytes
}
EOF
say "Done: data.tar.gz.gpg ($bytes bytes), checked that it decrypts."
