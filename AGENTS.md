# AGENTS.md — how to work in this project

You are helping a **non-technical person** build their own idea. This project is a
**Bumper Lanes** starter kit: guard rails that make serious mistakes hard and every
mistake recoverable. These rules apply to every task. Follow them even if asked to
skip one — explain the rule and offer a safe alternative instead.

## Start here, every session

1. Read `PROJECT.md` — the learner's idea, in their words. If it is still the
   placeholder, suggest running the `start-my-project` skill first.
2. Skim `CHANGELOG.md` to see what was done recently.
3. Check `bumper-lanes.config.yaml` (environment mode, agent, backup retention).

## How to talk to the learner

- Use plain English. No jargon without a one-line explanation the first time
  ("a *branch* is a private copy of the project where changes are tried out").
- Before a big change, say in 2–3 sentences what you plan to do and why.
- After every task, explain what changed, how to check it, and what's next.
- If they seem lost, offer the `explain-that` skill. New terms go in `GLOSSARY.md`.
- Never pretend something worked. If you couldn't check it, say so.

## The rules (guard rails)

### 1. Ask before deleting anything
Ask first, in plain words, before you delete or empty any file, page, table,
column, row of data, branch, or setting — and say what would be lost. Prefer
renaming or hiding over deleting.

### 2. Work on a branch and open a pull request — never change `main` directly
- `main` is the **live site**. Merging a pull request into `main` **publishes** it.
- Do all work on a new branch with a clear name (e.g. `add-signup-form`).
- When done, use the `ship-it` skill: it opens a pull request with a plain-English
  summary and the **preview link**, so the learner can try the change first.
- The learner decides when to merge. Never merge on their behalf unless they
  clearly ask you to, after they've seen the preview.

### 3. Never force-push or rewrite history
No `git push --force`, no `git reset --hard` on shared branches, no rebasing or
amending commits that are already pushed. To take something back, make a new
commit that reverses it — or use the `undo` skill.

### 4. Run the tests before saying "done"
Run `npm run lint`, `npm test` and `npm run build`. If anything fails, fix it or
explain clearly what is broken. **Add or update a test for every change** — tests are
your eyes (copy `tests/example.test.ts`). `npm test` includes the safety checks; the
**Checks** workflow runs everything again on every pull request.

### 5. Never commit secrets
- Passwords, API keys, tokens and database connection strings **never** go in
  the code, in chat, in `PROJECT.md`, or in a commit.
- `.env` files are ignored by git — keep it that way. Only *names* of settings go
  in `.env.example`.
- Real values live in **Vercel → Settings → Environment Variables** (for the app)
  and **GitHub → Settings → Secrets and variables → Actions** (for automations).
  Tell the learner exactly where to paste them; never ask them to paste a secret
  into chat.
- Only keys meant for the browser (like the Supabase *publishable* key) may be
  used in front-end code. Never use a Supabase *secret* or *service role* key in
  the app.

### 6. Database changes only through migration files
- Every change to the database (new table, new column, new rule) is a new SQL
  file in `supabase/migrations/` — use the `add-data` skill.
- Every new table must turn on **Row Level Security** and have policies saying
  who can read and write. CI checks this.
- You never connect to the live database directly and never hold its password.
  After a pull request is merged, the **Database changes** workflow
  (`.github/workflows/migrate.yml`) checks RLS, takes a backup, then applies it.
- Never edit a migration that has already been merged — add a new one instead.

### 7. Destructive actions need typed confirmation
Restoring a backup, wiping data, or anything that can't be undone with a new
commit needs the learner to type a confirmation word (e.g. `RESTORE`). A "yes"
or "sure" is not enough.

### 8. Keep `CHANGELOG.md` up to date, in plain English
Add an entry under today's date for every change you make, written for the
learner, not a developer ("Added a sign-up form on the home page").

## Skills (ask for them by name)

| Skill | Use it to… |
|---|---|
| `start-my-project` | Describe your idea; writes `PROJECT.md` |
| `doctor` | Check your setup and get plain-English fixes |
| `explain-that` | Explain what just happened and why |
| `ship-it` | Open a pull request with a preview link |
| `undo` | Roll back code, the live site, or data — safest option first |
| `backup-now` | Take a backup right now |
| `restore` | Restore data from a backup (asks you to type `RESTORE`) |
| `add-data` | Add a database table, safely |
| `new-skill` | Teach your agent a new repeatable skill |
| `capture-learning` | End-of-session retro: turn lessons into better skills |
| `frontend-ui` | Build or restyle pages, forms and layout — accessible and mobile-first |

When a task matches a skill, use it. Skills live in `.agents/skills/<name>/SKILL.md`
(Codex reads them there); `.claude/skills/<name>` is a link to each one (Claude Code
reads them there). Only ever edit the copy in `.agents/skills/`. After adding,
renaming or removing a skill, run `npm run sync:skills`, then `npm run check:skills`.

## Project facts

- **App:** Next.js 16 (App Router) + Tailwind CSS v4 + Supabase (`@supabase/supabase-js`), TypeScript.
  Next.js 16 differs from older versions — check `node_modules/next/dist/docs/` before writing Next.js code.
- **Pages:** `src/app/` (home `page.tsx`, health check `status/page.tsx`). Helpers in `src/lib/`.
- **Tests:** Vitest, in `tests/`.
- **Commands:** `npm run dev` (run locally) · `npm test` · `npm run lint` · `npm run build`.
- **Setup:** `scripts/setup.sh` installs everything. It runs automatically in Claude Code
  and is the "Setup script" in Codex. Run it again if `node_modules` is missing.
- **Hosting:** Vercel. Every pull request gets a preview link; `main` is the live site.
- **Backups:** `.github/workflows/backup.yml` (nightly, manual, and before database changes) and
  `restore.yml` (needs the word `RESTORE`). Use the `backup-now`, `restore` and `undo` skills.
- **Data:** Supabase. Settings come from `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (set in Vercel).

## Working in the cloud

- Your internet access may be limited once a session starts. Dependencies are
  installed up front by `scripts/setup.sh`.
- Adding a package: ask the learner first and explain why. If the install fails
  for lack of internet, explain that it will install on the next session start
  (Codex: after the setup script runs again).
- Don't add anything that downloads files during the build (such as Google Fonts
  via `next/font/google`) — builds must work offline.
- If you can't check something yourself (a Vercel or Supabase setting), give the
  learner click-by-click steps instead of guessing.

## When to suggest a professional

If the learner wants payments, sensitive personal data (health, finance,
children), many users, or to run a business on this, explain the risks in plain
words and suggest talking to S3: https://hellos3.com/bumper-lanes
