---
name: doctor
description: Checks the learner's setup — project files, Supabase connection, GitHub secrets and Vercel settings — and explains each fix in plain English, with click-by-click steps for anything that can't be checked from here. Use when the learner asks "is my setup ok?", "something's not working", "why isn't it connecting?", after a failed backup or database change, or when setting up for the first time.
---

# Doctor

Give the learner a short, friendly **checklist**: what's fine (✓), what needs fixing (✗) and
exactly how to fix it. Fix things inside the project yourself (after saying what you'll do);
for settings in GitHub, Vercel or Supabase, give click-by-click steps.

## 1. Check the project

Run `npm run doctor` (or `node scripts/doctor.mjs`). It checks Node.js, that setup ran,
`bumper-lanes.config.yaml`, `.env.example`, `PROJECT.md`, skills, Row Level Security, secrets
in files, and whether work is happening on a branch. If dependencies are missing, run
`bash scripts/setup.sh` and check again.

## 2. Check the app's Supabase connection

The app's Supabase settings live in **Vercel**, not in your workspace — so check them through
the site itself. Ask for the live web address (or find it in a recent pull request's Vercel
comment), then:

- If you can reach the internet, fetch `<address>/status`.
- Otherwise ask the learner to open `<address>/status` and tell you what the **Database** line says.

| `/status` says | What it means | Fix |
|---|---|---|
| ✓ Connected and answering | All good | — |
| ○ **Not connected yet** — lists `NEXT_PUBLIC_SUPABASE_URL` / `…_PUBLISHABLE_KEY` | Vercel doesn't have the Supabase settings | Vercel → project → **Storage** → connect Supabase (fills them in). Or **Settings → Environment Variables** → add both names with values from Supabase → **Save**. Then **Deployments → ⋮ → Redeploy** — new settings only apply to new deployments. |
| ✗ "did not accept the key" | Wrong or old key | Copy the **publishable** key again from Supabase → **Project Settings → API Keys**, update it in Vercel, redeploy. |
| ✗ "did not answer within … seconds" / mentions pausing | **The Supabase project is paused** (free projects pause after about a week without use) | supabase.com → your project → **Restore project** (or **Resume**). It takes a few minutes; then reload `/status`. |
| ✗ "Could not reach Supabase" | The address is wrong | Copy the **Project URL** again from Supabase → **Project Settings → API**, update `NEXT_PUBLIC_SUPABASE_URL` in Vercel, redeploy. |

## 3. Check GitHub secrets (for backups and database changes)

Needed names: `SUPABASE_DB_URL`, `BACKUP_PASSPHRASE`, `SUPABASE_ACCESS_TOKEN`
(`SUPABASE_PROJECT_REF` is optional).

- If you can reach GitHub, try `gh secret list` — it shows names only, never values.
  You may not have permission; that's fine.
- Otherwise, or as a second check: look at the latest **Backup** run (GitHub → Actions →
  Backup). "Data not backed up yet" means `SUPABASE_DB_URL` or `BACKUP_PASSPHRASE` is
  missing; a **Database changes** run that says "SUPABASE_DB_URL isn't set" means the same.

To add a missing secret, give these steps: GitHub → the project → **Settings** → **Secrets and
variables** → **Actions** → **New repository secret** → name exactly as above → paste the
value → **Add secret**. Where each value comes from:

- `SUPABASE_DB_URL`: Supabase → **Connect** → **Session pooler** connection string, with the
  database password filled in (the "direct" one won't work from GitHub).
- `BACKUP_PASSPHRASE`: a long sentence the learner makes up and **writes down somewhere safe**.
- `SUPABASE_ACCESS_TOKEN`: Supabase → avatar → **Account preferences → Access Tokens** →
  **Generate new token**.

**Never ask the learner to paste a secret into the chat**, and never write one into a file.

## 4. Report

Finish with the checklist, shortest first: what's fine, then each problem with its fix. Offer
to fix the ones inside the project. If everything is ✓, say so and suggest what to build next.
