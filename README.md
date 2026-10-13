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
- A free **Supabase** account (your database)
- **Claude Pro** or **ChatGPT Plus** (your AI agent)

## Getting set up (about 30 minutes)

1. **Copy this project.** Click the green **Use this template** button →
   **Create a new repository**. Choose **Private**.
2. **Put it online.** In Vercel, click **Add New → Project** and import your new
   repository. Vercel gives you a web address for your live site.
3. **Add a database.** In Supabase, create a **New project** (turn **off**
   "Automatically expose new tables", turn **on** "Enable automatic RLS"). Then,
   in Vercel → **Settings → Environment Variables**, add
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and
   **Redeploy**. Your site's **/status** page will say **Database: Connected**.
4. **Turn on backups.** In GitHub → **Settings → Secrets and variables →
   Actions**, add `SUPABASE_DB_URL`, `BACKUP_PASSPHRASE` and
   `SUPABASE_ACCESS_TOKEN` (the guides show where to find each one).
5. **Open it with your agent** — pick one:

   **Claude Code** — go to **claude.ai/code**, connect GitHub, and pick your
   repository. That's it: setup runs by itself when the session starts (the
   first time can take a minute or two).

   **Codex** — go to **chatgpt.com/codex** → **Settings → Environments →
   Create environment**, and pick your repository. Then:
   - In **Setup script**, paste: `bash scripts/setup.sh`
   - If there's a **Maintenance script** box, paste the same line there too.
   - If you see **Set package versions**, choose **Node.js 22**.
   - Save, then start a task in that environment.

6. **Say hello.** Ask your agent: **"Run start-my-project."** It will interview
   you about your idea and write it down in `PROJECT.md`.

Stuck? Ask your agent to **"run doctor"** — it checks your setup and tells you
what to fix, in plain English. You can also open your site's **/status** page.

## How building works

1. **Ask** for a change in plain English.
2. Your agent works on a **branch** (a private copy) and opens a **pull request**.
3. You get a **preview link** — try the change there.
4. Happy? **Merge** the pull request. **Merging publishes** it to your live site.
5. Not happy? Ask for changes, or say **"undo"**.

Your data is backed up every night and before every database change. Say
**"backup now"** any time, or **"restore"** to go back to an earlier backup.

## What's in this folder

| File | What it is |
|---|---|
| `PROJECT.md` | Your idea, in your words |
| `AGENTS.md` | The rules your agent follows (its "employee handbook") |
| `CHANGELOG.md` | A plain-English diary of every change |
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
