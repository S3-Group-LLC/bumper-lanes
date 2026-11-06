-- Bumper Lanes kit: safe defaults for your database (part of the kit — please don't edit or delete).
--
-- When you create a Supabase project by hand, Supabase offers two safety settings. Projects
-- created through Vercel don't show them, so the kit switches them on here (the same way
-- Supabase does). It's safe on a project that already has them.
--
--   1. New tables are NOT reachable by your app until a migration grants access
--      ("Automatically expose new tables: off"). The add-data skill writes those grants,
--      next to the Row Level Security rules that decide who sees which rows.
--   2. Row Level Security is switched on for every new table in `public`
--      ("Enable automatic RLS") — a safety net if a migration ever forgets.

-- 1. Don't expose new tables, sequences or functions in `public` automatically.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

-- 2. Switch Row Level Security on for every new table in `public`.
create schema if not exists bumper_lanes;

create or replace function bumper_lanes.enable_rls_on_new_tables()
returns event_trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  created record;
begin
  for created in
    select * from pg_event_trigger_ddl_commands()
    where object_type = 'table' and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security', created.object_identity);
  end loop;
end;
$$;
revoke all on function bumper_lanes.enable_rls_on_new_tables() from public;

-- Supabase's own version of this ("ensure_rls") may already be there; one is enough.
do $bumper_lanes$
begin
  if not exists (select 1 from pg_event_trigger where evtname in ('ensure_rls', 'bumper_lanes_enable_rls')) then
    create event trigger bumper_lanes_enable_rls
      on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function bumper_lanes.enable_rls_on_new_tables();
  end if;
end;
$bumper_lanes$;
