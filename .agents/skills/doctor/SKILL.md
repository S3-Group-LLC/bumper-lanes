---
name: doctor
description: Checks the learner's setup — project files, Supabase connection, GitHub secrets and Vercel settings — and explains each fix in plain English, with click-by-click steps for anything that can't be checked from here. Use when the learner asks "is my setup ok?", "something's not working", "why isn't it connecting?", after a failed backup or database change, or when setting up for the first time.
---

# Doctor

Give the learner a short, friendly **checklist**: what's fine (✓), what needs fixing (✗) and
exactly how to fix it. Fix things inside the project yourself (after saying what you'll do);
for settings in GitHub, Vercel or Supabase, give click-by-click steps.

## 1. Check the project

Run `npm run doctor` (or `node scripts/doctor.mjs`). It says where you're working (cloud or this
computer); in the cloud it checks `gh`/`supabase` are installed and **tests which websites you can
reach** — if any are blocked, pass on its exact allowlist steps. Working on the learner's own
computer ("local") is fine: say it works but ties the project to that computer, and don't ask
for `.env.local`, GPG or other local setup unless they want it. It also checks Node.js, that setup ran,
`bumper-lanes.config.yaml`, `.env.example`, `PROJECT.md`, skills, Row Level Security, secrets
in files, and whether work is happening on a branch. If dependencies are missing, run
`bash scripts/setup.sh` and check again.

## 2. Check the app's Supabase connection

The app's Supabase settings live in **Vercel**, not in your workspace — so check them through
the site itself. When Supabase was added through Vercel (the usual setup), Vercel created
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `…_ANON_KEY`),
`SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` and `POSTGRES_*`, marked
**Sensitive**: nobody can read them back from Vercel, not even the learner. That's expected —
never ask for the values. The app reads them; backups get their own copies (step 3). Ask for the live web address (or find it in a recent pull request's Vercel
comment), then:

- If you can reach the internet, fetch `<address>/status`.
- Otherwise ask the learner to open `<address>/status` and tell you what the **Database** and
  **Backups** lines say.

| `/status` says | What it means | Fix |
|---|---|---|
| ✓ Connected and answering | All good | — |
| ✗ "the address of the Supabase dashboard" / "ends in /rest/v1" / "isn't a web address" | `NEXT_PUBLIC_SUPABASE_URL` holds the wrong thing — the message says what to use instead | Update it in Vercel → **Settings → Environment Variables** with the exact value `/status` suggests, then redeploy. |
| ✗ "holds a secret key" | A **secret** key was pasted into a public setting (the app refuses to use it) | Paste the **publishable** key (starts with `sb_publishable_`) in Vercel, redeploy, then Supabase → **Project Settings → API Keys** → create a new secret key and delete the old one. |
| ○ **Not connected yet** — lists `NEXT_PUBLIC_SUPABASE_URL` / `…_PUBLISHABLE_KEY` | Vercel doesn't have the Supabase settings | Vercel → project → **Storage** → connect Supabase, or **Create Database → Supabase** (free plan; fills them in). Then **Deployments → ⋮ → Redeploy** — new settings only apply to new deployments. Setting up by hand instead: hellos3.com/bumper-lanes/reference/setting-up-by-hand. |
| ✗ "did not accept the key" | Wrong or old key | Copy the **publishable** key again from Supabase → **Project Settings → API Keys**, update it in Vercel, redeploy. |
| ✗ "did not answer within … seconds" / mentions pausing | **The Supabase project is paused** (free projects pause after about a week without use) | supabase.com → your project → **Restore project** (or **Resume**). It takes a few minutes; then reload `/status`. |
| ✗ "Could not reach Supabase" | The address is wrong | Copy the **Project URL** again from Supabase → **Project Settings → API**, update `NEXT_PUBLIC_SUPABASE_URL` in Vercel, redeploy. |

The **Backups** line: ✓ "Last backup: …" is fine. ⚠ "days old" → check the latest **Backup** run
(step 3). ⚠ "Stored files weren't included" → a storage secret is missing (step 3). ○ "Not switched
on yet" → fine until the first database change. If the secrets in step 3 are already set, GitHub →
**Actions → Database changes → Run workflow**. ○ "No backup recorded yet" → run **backup-now**.

## 3. Check GitHub secrets (for backups and database changes)

Needed names: `SUPABASE_DB_URL`, `SUPABASE_SECRET_KEY`, `BACKUP_PASSPHRASE`. Older setups may have
`SUPABASE_ACCESS_TOKEN` instead of `SUPABASE_SECRET_KEY` — that still works. Backups aren't needed
until the first database change, so if there are no database changes of the learner's own yet, just
mention that **add-data** sets them up first. Once there are, keep reminding them until they're on.

**To switch them on, run `npm run connect-backups`.** It sets what it can with `gh secret set`
(reading the database address and secret key from Vercel when it can), asks the learner to type
the rest into a hidden prompt when there's a terminal they can type in, and otherwise prints
click-by-click steps — relay those. `npm run connect-backups -- --check` lists which are set
(names only).

**In the cloud you can't add secrets**: your GitHub access can run workflows but not manage
secrets. That's expected, so don't ask the learner to create a personal access token or change your
environment's settings to get around it. A token is a long-lived key, and the secrets include their
database password; adding them straight into GitHub is safer and takes about ten minutes. If they
ask you to do it anyway, say that in one sentence, then give the steps. Point them to the full
guide: https://hellos3.com/bumper-lanes/get-started/add-secrets

Before they start, tell them to **save their database password and backup passphrase somewhere
safe** (a password manager is ideal): neither can be read back later, and nobody can open their
backups without the passphrase. Once they've added the secrets, run `gh workflow run migrate.yml`,
wait for it, then use **backup-now** and report what happened.

- If you can reach GitHub, try `gh secret list` — it shows names only, never values.
  You may not have permission; that's fine.
- Otherwise, or as a second check: look at the latest **Backup** run (GitHub → Actions →
  Backup). "Data not backed up yet" means `SUPABASE_DB_URL` or `BACKUP_PASSPHRASE` is
  missing; a **Database changes** run that says "SUPABASE_DB_URL isn't set" means the same.

To add a missing secret, give these steps: GitHub → the project → **Settings** → **Secrets and
variables** → **Actions** → **New repository secret** → name exactly as above → paste the
value → **Add secret**. Where each value comes from:

- `SUPABASE_DB_URL`: Supabase → **Connect** → **Session pooler** connection string, with the
  database password filled in (the "direct" one won't work from GitHub). The learner opens
  Supabase from Vercel: project → **Storage** → **Open in Supabase**. If Vercel created the
  database they've never had a password: Supabase → **Database → Settings → Reset database
  password → Generate a password**. The starter app doesn't use it, so resetting is safe.
- `BACKUP_PASSPHRASE`: a long sentence the learner makes up and **writes down somewhere safe**.
- `SUPABASE_SECRET_KEY`: Supabase → **Project Settings → API Keys** → **Secret keys** → copy
  (or create one).

**Never ask the learner to paste a secret into the chat**, and never write one into a file.

## 4. Report

Finish with the checklist, shortest first: what's fine, then each problem with its fix. Offer
to fix the ones inside the project. If everything is ✓, say so and suggest what to build next.
