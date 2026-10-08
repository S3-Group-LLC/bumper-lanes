---
name: restore
description: Helps put data back from a backup — rows, user accounts and uploaded files — after something was deleted or changed by mistake. Explains what will be overwritten and walks the learner through running the Restore workflow, which they confirm by typing RESTORE. Use when data is lost, wrong, or the learner asks to restore.
---

# Restore data

Restoring **replaces data**, so this skill is careful and slow on purpose.

**Rules:**

- **You never start the Restore workflow yourself, and you never type `RESTORE` for the
  learner.** The learner runs it in GitHub and types the word themselves. That typed word is
  their confirmation (guard rail GR-6).
- You never connect to the live database. The workflow does the work.
- Code and the live website are not restored here — for those, use the **undo** skill.

## 1. Understand what went wrong

Ask: What data is wrong or missing? When was it last right? Has anything **good** been added
since then (new sign-ups, new entries)? Restoring will take the data back to the backup —
newer entries in those tables will be lost (though a safety copy is kept, see below).

## 2. Pick a backup

Backups are made every night, before every database change, and whenever someone runs
**backup-now**. They're kept for `backups.retention_days` days (see
`bumper-lanes.config.yaml`).

- **If you can reach GitHub:**
  `gh api "repos/{owner}/{repo}/actions/artifacts?per_page=50" --jq '.artifacts[] | select(.name | startswith("backup-")) | select(.name | startswith("backup-nodata") | not) | "\(.created_at)  \(.name)"'`
- **Otherwise:** GitHub → **Actions** → **Backup** shows each run with its date.

Choose the **newest backup from before the problem started**. You'll need either its date
(`YYYY-MM-DD` — the newest backup that day is used) or `latest`.

## 3. Explain exactly what will happen

Say this in your own words, filling in the details, and **ask the learner to confirm they
want to go ahead**:

- The rows in every table that existed at backup time go back to how they were then.
  Anything added or changed in those tables since — including **people who signed up
  since** — goes back too.
- Uploaded files from the backup are put back. Files added since are kept.
- Tables created **after** the backup aren't touched. The *shape* of tables (columns) isn't
  changed.
- **Just before restoring, the workflow saves a safety backup of the data as it is now** —
  so if this goes wrong, it can be undone by restoring that safety backup.
- If anything fails, nothing is changed.

Use **data** mode. Only use **full** mode to rebuild everything in a brand-new, empty Supabase
project (for example if the old one was deleted) — and only after the learner has pointed
`SUPABASE_DB_URL` at the new project.

## 4. The learner runs it

Give these steps:

1. Open the project on **github.com** → **Actions** tab → **Restore** (left list).
2. Click **Run workflow** (right side) and fill in:
   - **Which backup:** the date you chose (e.g. `2026-10-07`) or `latest`
   - **mode:** `data`
   - **confirm:** type `RESTORE` in capital letters
3. Click the green **Run workflow** button. It takes about 3–4 minutes.

## 5. Check the result

- A green ✓ on the run means it worked. Open it: the summary names the backup that was used
  and where the safety backup is.
- Check the data together with the learner (in the app, `/status`, or Supabase → Table Editor).
- A red ✗ means **nothing was changed**. Open the run, read the message, and explain it. A
  common one: a table in the backup has since been removed or renamed.

Add a plain-English line to `CHANGELOG.md` ("Restored the data from <date> after …").
