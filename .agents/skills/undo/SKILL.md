---
name: undo
description: Takes something back after a mistake — works out whether the problem is in the code, the live website, or the data, and proposes the safest way to undo it. Use when the learner says undo, go back, revert, roll back, "it was working before", "I broke it", or something went wrong after a change.
---

# Undo

Your job: find out **what** went wrong, pick the **right layer** to undo, explain the plan in
plain English, and only act after the learner says yes. Stay calm and reassuring — almost
everything in a Bumper Lanes project can be put back.

## 1. Understand what happened

If it isn't already clear, ask (one or two questions at a time):

- What do you see that's wrong? Where — the live site, a preview link, or your data?
- When did it last work the way you wanted?
- What changed since then? (A merged pull request? Something done in Supabase or Vercel?)

Look at recent history yourself: `git log --oneline -15 origin/main`, `CHANGELOG.md`, and —
if you can reach GitHub — `gh pr list --state merged --limit 10`.

## 2. Pick the layer

| What the learner describes | Layer | What to do |
|---|---|---|
| The **live site is broken right now** (error page, blank page, something badly wrong that everyone can see) | **Live site**, then code | Roll the live site back first (seconds, section 4), then undo the code (section 3) so the fix sticks |
| One specific change they merged did something they don't want | **Code** | Revert that pull request (section 3a) |
| "Go back to how everything was on <day>" | **Code** | Restore the files from that day's backup tag (section 3b) |
| Rows, user accounts or uploaded files were deleted or changed by mistake | **Data** | Use the **restore** skill — don't try to fix data yourself |
| The problem is only on a preview link / an unmerged pull request | Nothing is live | Fix it on the branch, or close the pull request. No undo needed |

Explain your choice in one or two sentences, say what will and won't change, and **ask for a
clear yes before doing anything**. If more than one layer is involved, say so and do them one
at a time.

## 3. Code

Code undos always go through a pull request, so the learner sees a preview before anything
goes live. Never force-push, never reset `main`, never rewrite history.

### 3a. Undo one merged change (revert)

1. Find the merge. Show the learner the last few merged changes in plain words and confirm
   which one: `git log --oneline --merges -10 origin/main` (or `gh pr list --state merged`).
2. Make an undo branch from the latest code:
   `git fetch origin && git switch -c undo-<short-name> origin/main`
3. Revert it:
   - a merge commit: `git revert --no-edit -m 1 <merge-commit>`
   - a squashed change (no merge commit): `git revert --no-edit <commit>`
   If git reports conflicts, stop and explain them in plain English before going further.
4. **Database changes:** if the change included files in `supabase/migrations/`, do **not**
   remove them — they have already been applied, and deleting them breaks future database
   changes. Put them back: `git checkout origin/main -- supabase/migrations` and commit.
   If the database change itself must be undone, tell the learner: either write a **new**
   migration that reverses it (warn clearly if that would delete data — a backup is taken
   automatically before it runs), or use the **restore** skill for the data.
5. Run `npm run lint`, `npm test` and `npm run build`.
6. Open the pull request with the **ship-it** skill: "Merging this undoes <change>."

### 3b. Go back to how things were on a day (backup tag)

Every night a tag `backup/YYYY-MM-DD` marks the live code. List them:
`git fetch origin --tags && git tag --list 'backup/*' --sort=-creatordate | head -14`

1. `git switch -c undo-to-<date> origin/main`
2. Make the files match that day, **except** database changes (same reason as 3a step 4):
   `git restore --source=backup/<date> --staged --worktree -- . ':(exclude)supabase/migrations'`
   This also removes files that were added after that day — list them for the learner first.
3. `git commit -m "Go back to the code from <date>"`, then steps 5–6 from 3a.

## 4. Live site (Vercel)

You can't do this one yourself — guide the learner, click by click:

1. Open **vercel.com** → your project → **Overview**.
2. On the **Production Deployment** box, click **Instant Rollback**.
3. Pick the previous version → **Continue** → **Confirm Rollback**. It takes seconds.

Tell them, plainly:

- On Vercel's free plan you can only go back **one** version. To go further back, undo the
  code instead (section 3) — merging it publishes the older code.
- **After a rollback, new changes stop going live automatically.** Once the code fix from
  section 3 is merged and Vercel has built it, go to **Overview** → **Undo Rollback** → pick the
  newest version → **Confirm**. Until then, merging won't change the live site.

## 5. Data

Hand off to the **restore** skill. Data is restored from the nightly backups by a workflow the
learner runs and confirms by typing `RESTORE` — never try to change live data yourself.

## Afterwards

- Check the result with the learner (preview link, live site, `/status`).
- Add a plain-English line to `CHANGELOG.md` ("Undid the change that …").
- Suggest the **capture-learning** skill if there's a lesson worth keeping.
