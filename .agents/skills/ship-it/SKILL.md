---
name: ship-it
description: Gets a change ready to go live — runs the checks, opens a pull request with a plain-English summary and what to check, and finds the preview link. Explains that merging publishes to the live site; merges only if the learner asks. Use when the learner says "ship it", "I'm happy with it", "let's publish", "put it online", or a change is finished.
---

# Ship it

Your job ends at a **pull request with a preview link**. The learner tries the preview and
decides. **You don't merge on your own** — merging publishes to the live site, and that choice
is theirs.

## 1. Make sure it's ready

- The work is on a branch, not `main`. If it's on `main`, move it:
  `git switch -c <short-descriptive-name>` (uncommitted changes come along).
- Run `npm run lint`, `npm test` and `npm run build`. If anything fails, fix it or explain
  what's wrong — don't open a pull request with failing checks.
- Add a plain-English line to `CHANGELOG.md` under today's date.
- Database changes? Then `npm run check:rls` must pass, and say in the summary that the change
  is applied after merging, with a backup first.

## 2. Open the pull request

Commit with a plain message ("Add a sign-up form to the home page") and push the branch.

Write the pull request for the learner, not a developer:

```markdown
## What this changes
<one to three plain sentences>

## What to check on the preview
- <the page to open and what you should see>
- <anything to try, e.g. "submit the form with your email">

## When you merge
Merging publishes this to your live site. (Database changes are applied right after, with a backup first.)
```

- **Claude Code:** `gh pr create --title "<plain title>" --body-file <file>` — or use the
  **Create PR** button if `gh` isn't available.
- **Codex:** use Codex's **Create PR** button, and paste the summary above into the description.

## 3. Find the preview link

Vercel builds a preview for every pull request (about 1–2 minutes) and posts a comment with a
**Visit Preview** link.

- If you can reach GitHub: `gh pr view --comments` (look for the Vercel comment), or
  `gh pr checks` (the Vercel check links to the preview).
- Otherwise: "Open the pull request on GitHub and click **Visit Preview** in Vercel's comment."

## 4. Hand over

Tell the learner, in this order:

1. The preview link and what to check on it.
2. "Four **Checks** run on the pull request — *Does it build?*, *Do the tests pass?*, *Is your data
   protected?*, *Any secrets leaked?* — wait for the green ✓s."
3. "When you're happy, click **Merge pull request** on GitHub. **Merging = publishing**: your
   live site updates a minute or two later."
4. "Not happy? Tell me what to change — I'll update the same pull request."

By default, walk them through clicking **Merge** themselves — it's their publish button. If they
clearly ask you to merge it for them ("just merge it"), say once that this publishes to the live
site, and if they confirm, merge the pull request (e.g. `gh pr merge --merge`). Never turn on
auto-merge and never push straight to `main` unless they ask for that too.
