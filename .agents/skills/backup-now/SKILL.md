---
name: backup-now
description: Takes a backup of the whole project right now — code, live-site details and data — and explains what was saved. Use when the learner says back up, save a copy, "make a backup before…", or is about to try something risky.
---

# Backup now

Backups also happen automatically **every night**, **before every database change**, and
**before every restore**. Use this skill when the learner wants one right now — for example
before a big change.

## What gets saved

Explain this briefly, in plain words:

- **Code** — a bookmark (tag `backup/<today>`) of the live code.
- **Live site** — which versions were live recently, and the *names* of the settings
  (never the values).
- **Data** — every table, user account and uploaded file, **encrypted** with the backup
  passphrase. Kept for the number of days in `bumper-lanes.config.yaml`
  (`backups.retention_days`, 14 by default).

Taking a backup changes nothing in the project, so the learner asking for one is enough —
no extra confirmation needed.

## Start it

**If you can reach GitHub** (try `gh auth status`):

1. `gh workflow run backup.yml`
2. Find the run: `gh run list --workflow backup.yml --limit 1`
3. Wait for it: `gh run watch <run-id>` (about 2 minutes).
4. Report the result: the backup's name (e.g. `backup-2026-10-08-run123…`) and what it
   contained — the run's summary shows the number of tables and files.

**If you can't reach GitHub** (no network, or `gh` isn't allowed), give the learner these
steps instead:

1. Open the project on **github.com** → **Actions** tab.
2. In the left list, click **Backup**.
3. Click **Run workflow** (right side) → the green **Run workflow** button.
4. Wait about 2 minutes for a green ✓. Click the run to see what was saved.

## If something's missing

- **"Data not backed up yet"** in the summary: Supabase isn't connected for backups — the
  `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE` secrets aren't set. Run the **doctor** skill.
- **A red ✗**: open the run, read the first red step, and explain it in plain English.
  The most common cause is a wrong `SUPABASE_DB_URL` (it must be the **Session pooler**
  connection string).

More detail for the learner: the Bumper Lanes guide "Backups and undo"
(https://hellos3.com/bumper-lanes).
