-- Adds a "notes" table. Each signed-in person can see, add, change and delete only their
-- own notes. (Pattern A: private to each person.)

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- Row Level Security: nobody can see or change any row unless a policy below allows it.
alter table public.notes enable row level security;

-- Let signed-in people reach the table at all (new tables aren't reachable until granted).
grant select, insert, update, delete on table public.notes to authenticated;

create policy "People can read their own notes" on public.notes
  for select to authenticated using ((select auth.uid()) = owner_id);

create policy "People can add their own notes" on public.notes
  for insert to authenticated with check ((select auth.uid()) = owner_id);

create policy "People can change their own notes" on public.notes
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "People can delete their own notes" on public.notes
  for delete to authenticated using ((select auth.uid()) = owner_id);
