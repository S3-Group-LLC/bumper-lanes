# Bumper Lanes by S3

**Build your own idea with an AI agent — with guard rails.**

This is your project. You describe what you want in plain English, an AI agent
(Claude Code or Codex) builds it, and you check a preview before anything goes
live. Mistakes can be undone. Everything runs in your web browser — nothing to
install.

📚 Step-by-step guides, lessons and help: **https://hellos3.com/bumper-lanes**

---

## What you need

- A free **GitHub** account (stores your project)
- A free **Vercel** account (puts your website online)
- A free **Supabase** database (Vercel creates it for you — no separate sign-up)
- **Claude Pro** or **ChatGPT Plus** (your AI agent)

## Getting set up (about 15 minutes)

First create a **GitHub** account, then a **Vercel** account with **Continue
with GitHub** (Hobby plan). Your database is created for you in step 3.

1. **Copy this project.** Click the green **Use this template** button →
   **Create a new repository**. Choose **Private**.
2. **Put it online.** Open [vercel.com/new](https://vercel.com/new) and
   **Import** your new repository (Vercel may offer it as "New repository
   detected").
3. **Add the database.** When Vercel suggests **Supabase**, click **Add** →
   **Create New Supabase Account** → your region → **Supabase Free Plan** →
   **Accept and Create** → connect it to **Production** and **Preview** (leave the
   paid Preview Branch options unticked) → **Deploy**. Nothing to copy by hand.
   Your site's **/status** page will say **Database: Connected**.
4. **Open it with your agent** — pick one:

   **Claude Code** — go to **claude.ai/code**, connect GitHub, and pick your
   repository. That's it: setup runs by itself when the session starts (the
   first time can take a minute or two).

   **Codex** — go to **chatgpt.com/codex**, start a task with **Work in →
   Cloud** (not Local) → **Select environment → Create environment**, and pick
   your repository → **Get started**. Then:
   - If it asks how to set up, say: *"Use `bash scripts/setup.sh` as the install
     script, with Node.js 22."*
   - Turn on **Allow Codex to access internet** → **Package managers**, and add
     the domains listed in the guide (GitHub, Supabase, Vercel).
   - **Publish**, then start a new task in that environment.

5. **Say hello.** Ask your agent: **"Run start-my-project."** It will interview
   you about your idea and write it down in `PROJECT.md`.

Stuck? Ask your agent to **"run doctor"** — it checks your setup and tells you
what to fix, in plain English. You can also open your site's **/status** page.

## Before your first database change: turn on backups

You don't need this on day one, because your database starts empty. **The first time your project
needs to store information, your agent stops and walks you through it** (about 10 minutes).

In the cloud your agent can't add GitHub secrets, so you add these three yourself: GitHub →
**Settings → Secrets and variables → Actions → New repository secret**. Say **"connect backups"** for
a direct link, then follow the steps at https://hellos3.com/bumper-lanes/get-started/add-secrets

- `SUPABASE_DB_URL`: Supabase → **Connect** → **Session pooler**, with your database password in
  place of `[YOUR-PASSWORD]`. Vercel created your database, so first set a password: Supabase →
  **Database → Settings → Reset database password**.
- `SUPABASE_SECRET_KEY`: Supabase → **Project Settings → API Keys → Secret keys**.
- `BACKUP_PASSPHRASE`: a sentence of at least 20 characters that you make up.

**Save your database password and backup passphrase somewhere safe.** You can't read them back
later, and nobody can open your backups without the passphrase. Then ask your agent to run
**Database changes** and **Backup**, and check they worked.

## How building works

1. **Ask** for a change in plain English.
2. Your agent works on a **branch** (a private copy) and opens a **pull request**.
3. You get a **preview link** — try the change there.
4. Happy? **Merge** the pull request. **Merging publishes** it to your live site.
5. Not happy? Ask for changes, or say **"undo"**.

Once backups are on, your data is backed up every night and before every database
change. Say **"backup now"** any time, or **"restore"** to go back to an earlier backup.

## What's in this folder

| File | What it is |
|---|---|
| `PROJECT.md` | Your idea, in your words |
| `AGENTS.md` | The rules your agent follows (its "employee handbook") |
| `CHANGELOG.md` | A plain-English diary of every change |
| `DECISIONS.md` | Why things are the way they are — the big choices and their trade-offs |
| `GLOSSARY.md` | What all the new words mean |
| `bumper-lanes.config.yaml` | A few settings (which agent, how long to keep backups) |
| `src/` | Your website's code — your agent edits this |
| `supabase/` | Your database changes |

## Keep these safe

Passwords and keys **never** go in this project or in a chat with your agent.
They live in **Vercel** and **GitHub** settings. Your agent will tell you where.

## Want help turning it into a business?

Free tiers are for learning and trying ideas — Vercel's free plan, for example,
is for non-commercial use. When you're ready to make it real, S3 can help:
**https://hellos3.com/bumper-lanes**
