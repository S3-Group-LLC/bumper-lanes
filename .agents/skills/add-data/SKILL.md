---
name: add-data
description: Adds a new database table (or new columns) safely — as a migration file with Row Level Security, access rules and a test — and explains how it goes live. Use when the learner wants to store or save information, add a table, list, form submissions, user profiles, or "a database for X".
---

# Add data

Every database change is a **migration file** in `supabase/migrations/`. You never connect to
the live database and never run the change yourself: after the learner merges, the
**Database changes** workflow checks it, takes a backup, then applies it.

## 1. Ask what to store and who may see it

In plain English, find out:

1. **What information?** Turn their answer into columns (e.g. "a title, a due date, done or
   not" → `title text`, `due_on date`, `done boolean`). Suggest sensible types; keep it small.
2. **Who can see it, and who can add, change or delete it?** Offer these choices:

| Pattern | Example | Needs sign-in? |
|---|---|---|
| **A. Private to each person** — people see and change only their own rows | to-do lists, notes, saved items | Yes |
| **B. Everyone can see, owners change** | community posts, a public directory | To add/change: yes |
| **C. Anyone can send, nobody can read in the app** | contact form, sign-up for updates | No — you read them in Supabase |
| **D. Everyone can read, only you change it** | a menu, a price list, FAQs | No |

If they pick A or B and the app has no sign-in yet, say so: it will need sign-in (Supabase
Auth) before people can save their own data. Offer to add that next.

## 2. Write the migration

- File name: `supabase/migrations/<UTC timestamp YYYYMMDDHHMMSS>_<what_it_does>.sql`,
  e.g. `20261008143000_create_todos.sql`. Use the current time so it sorts after older ones.
- Start from [the example](references/example-migration.sql) (pattern A) or the matching
  pattern in [policies](references/policies.md). Every new table **must** have:
  1. a primary key `id uuid primary key default gen_random_uuid()` and `created_at`;
  2. `alter table … enable row level security;`
  3. explicit `grant …` lines — new tables aren't reachable by the app until granted;
  4. policies saying exactly who can read/add/change/delete (use `(select auth.uid())`).
- Put a short plain-English comment at the top saying what the change does.
- **Never edit a migration that's already been merged** — write a new one to change it.
- Changing an existing table? Add columns with `alter table … add column …`. Removing a
  column or table **deletes data**: ask first, and say a backup is taken automatically.

## 3. Use it in the app (optional, can be a separate pull request)

- Add a small helper in `src/lib/<table>.ts` that uses `getSupabase()` from
  `src/lib/supabase.ts`, and handle "not connected yet" (`getSupabase()` returns `null`).
- **Ship the migration first, then the app code** in a second pull request: in this project,
  preview sites use the live database, so a new table only exists after the migration is
  merged and applied.

## 4. Check it

- `npm run check:rls` — must pass (the pull request's *Is your data protected?* check runs it too).
- `npm test` — the project's tests re-run the RLS and secret checks automatically. If you
  added a helper in `src/lib/`, add a test for it with a fake Supabase client.
- `npm run lint` and `npm run build`.

## 5. Explain how it goes live

Tell the learner, in plain words:

1. Open the pull request with **ship-it**. The *Is your data protected?* check confirms the table is protected.
2. When they merge, GitHub runs **Database changes**: safety check → **backup** → apply.
   It takes about 3 minutes (GitHub → Actions → Database changes).
3. If it fails, nothing is changed — the summary says why, and you can fix it with a new
   migration.

Add a line to `CHANGELOG.md` ("Added a place to store <thing>, private to each person").
