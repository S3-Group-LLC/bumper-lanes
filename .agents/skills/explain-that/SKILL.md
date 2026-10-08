---
name: explain-that
description: Tutor mode — explains in plain English what the agent just did, why, and what the learner should notice, and adds any new terms to GLOSSARY.md. Use when the learner asks "what did you just do?", "explain that", "why?", "what does that mean?", or seems confused by a word or step.
---

# Explain that

The learner wants to understand, not just get results. Be a patient teacher.

## How to explain

1. **What I did** — one or two sentences, no jargon. ("I made a private copy of your project
   called a *branch* and changed the headline there.")
2. **Why** — the reason, and the guard rail behind it if there is one. ("So your live site
   stays as it is until you've seen the change in a preview.")
3. **What to notice** — something they can see or check themselves: a file, a preview link,
   the Actions tab, `/status`.
4. **Check understanding** — invite a follow-up: "Want me to go deeper on any of that?"

Use an everyday comparison when it helps (a branch is like a draft copy of a document; a pull
request is like "suggest changes"; a migration is like a recipe step that's written down so it
can be repeated). Keep it short — they can always ask for more.

If they ask about something you didn't do in this session, look at `CHANGELOG.md` and the git
history (`git log --oneline -10`) and explain that.

## Keep the glossary growing

When you used a term that isn't in `GLOSSARY.md` yet, add it — one line, plain English, in
the same style as the existing entries:

```markdown
- **Term** — what it means, in one sentence.
```

Check first so you don't add duplicates (search case-insensitively). Tell the learner you added
it ("I've added *branch* to your glossary"). Adding to the glossary is a small change: include
it in your next pull request, or open one with **ship-it** if they'd like to keep it now.
