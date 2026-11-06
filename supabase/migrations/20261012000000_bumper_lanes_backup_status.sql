-- Bumper Lanes kit: backup status (part of the kit — please don't edit or delete).
--
-- Every successful backup (.github/workflows/backup.yml) adds a row to
-- bumper_lanes.backup_runs, so your site's /status page can show when the last one
-- ran and what it covered — with no extra settings.
--
-- The table is private: Row Level Security is on with no policies, and the app's keys
-- have no access to it. Only the function below is open to the app, and it shares
-- nothing but the time of the latest backup and what it included.

create schema if not exists bumper_lanes;
revoke all on schema bumper_lanes from public, anon, authenticated;

create table if not exists bumper_lanes.backup_runs (
  run_id     text primary key, -- the GitHub Actions run that made the backup
  created_at timestamptz not null,
  database   boolean not null,
  files      boolean not null,
  code       boolean not null,
  tables     integer not null default 0,
  file_count integer not null default 0
);
alter table bumper_lanes.backup_runs enable row level security;
revoke all on bumper_lanes.backup_runs from public, anon, authenticated;

create or replace function public.bumper_lanes_backup_status()
returns table (created_at timestamptz, database boolean, files boolean, code boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select r.created_at, r.database, r.files, r.code
  from bumper_lanes.backup_runs r
  order by r.created_at desc
  limit 1;
$$;
revoke all on function public.bumper_lanes_backup_status() from public;
grant execute on function public.bumper_lanes_backup_status() to anon, authenticated;
