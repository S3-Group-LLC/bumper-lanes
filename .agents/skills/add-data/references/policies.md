# Access patterns

Pick the pattern the learner chose and adapt the table name and columns. Each example is a
complete, safe migration: table → Row Level Security → grants → policies. Pattern A is in
[example-migration.sql](example-migration.sql).

Use `(select auth.uid())` (with the `select`) — Supabase recommends it for speed.

## B. Everyone can see, owners change

```sql
-- Adds "posts": anyone can read them; signed-in people add, change and delete their own.
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  body text,
  created_at timestamptz not null default now()
);
alter table public.posts enable row level security;

grant select on table public.posts to anon, authenticated;
grant insert, update, delete on table public.posts to authenticated;

create policy "Anyone can read posts" on public.posts
  for select to anon, authenticated using (true);
create policy "People can add their own posts" on public.posts
  for insert to authenticated with check ((select auth.uid()) = author_id);
create policy "People can change their own posts" on public.posts
  for update to authenticated
  using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
create policy "People can delete their own posts" on public.posts
  for delete to authenticated using ((select auth.uid()) = author_id);
```

## C. Anyone can send, nobody can read in the app

Good for contact forms. You read the messages in Supabase → Table Editor.

```sql
-- Adds "contact_messages": anyone can send one; nobody can read them through the app.
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null check (char_length(email) <= 320),
  message text not null check (char_length(message) <= 5000),
  created_at timestamptz not null default now()
);
alter table public.contact_messages enable row level security;

grant insert on table public.contact_messages to anon, authenticated;

create policy "Anyone can send a message" on public.contact_messages
  for insert to anon, authenticated with check (true);
-- No select policy on purpose: messages can't be read through the app.
```

Length limits (`check (...)`) stop people from sending huge messages. For a public form, also
consider spam protection — ask the learner.

## D. Everyone can read, only you change it

You add and edit rows in Supabase → Table Editor (or in later migrations).

```sql
-- Adds "menu_items": anyone can read the menu; only the owner edits it in Supabase.
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  created_at timestamptz not null default now()
);
alter table public.menu_items enable row level security;

grant select on table public.menu_items to anon, authenticated;

create policy "Anyone can read the menu" on public.menu_items
  for select to anon, authenticated using (true);
-- No insert/update/delete policies: changes are made in the Supabase dashboard.
```

## Adding a column later

```sql
-- Adds a "done" flag to notes.
alter table public.notes add column done boolean not null default false;
```

Existing policies and grants keep working for new columns.
