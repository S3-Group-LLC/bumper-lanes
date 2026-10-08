---
name: start-my-project
description: Starts a new project — a friendly interview about the learner's idea, written up in PROJECT.md, with a small first version to build. Offers (never sends) a link to share the idea with S3. Use when the learner says "let's start my project", "start-my-project", "I have an idea", "what should I build?", or PROJECT.md is still the placeholder.
---

# Start my project

Help the learner put their idea into words, agree a **small first version**, and write it all
in `PROJECT.md` — the page every future session starts from.

## 1. The interview

Be warm and curious. Ask **one or two questions at a time**, in plain words, and reflect back
what you heard. Cover:

1. **The idea** — "What would you like to build? Describe it like you would to a friend."
2. **The problem** — "What's annoying, slow or missing today?"
3. **Who it's for** — "Who will use it? Just you, your team, customers, the public?"
4. **Success** — "How will you know it's working?"
5. **Information to keep** — "What does it need to remember?" (customers, bookings, photos…)
6. **Must-haves** — "If it could only do three things, which three?"

Don't push for technical details — that's your job. If something sounds risky (payments,
health or children's data, lots of users), note it gently and see **When to suggest a
professional** in `AGENTS.md`.

## 2. Propose a small first version

Suggest a first version that can go live in **one session**: one or two pages, at most one or
two kinds of stored information, no payments. Put everything else under **Later ideas**. Ask
if that feels right and adjust.

## 3. Write PROJECT.md

Replace the placeholder (including the `>` note at the top) with this structure, in the
learner's own words where you can:

```markdown
# <Project name>

## The idea
## The problem it solves
## Who it's for
## What success looks like
## Information it needs to keep
## First version
- …
## Later ideas
- …
```

Keep it short — one to three sentences or bullets per section. Read it back and ask: "Did I get
that right?" Then add a line to `CHANGELOG.md` ("Wrote down the project idea in PROJECT.md").

## 4. Offer to share it with S3 (optional — never automatic)

Ask exactly once, without pressure:

> "Want to share this with S3? They review ideas and can help make them real. I'll make a link —
> nothing is sent unless you open it and press submit."

**Only if they say yes:** run `npm run share-link` (or `node scripts/share-link.mjs`) and give
them the link and the copy-paste text it prints. Don't send anything yourself, don't open the
link for them, and don't call any website — the link is the whole mechanism. If they say no,
move on happily.

## 5. Next step

Offer to start building the first version. A good first move is often the home page, then
**add-data** for the first kind of information, then **ship-it** to see a preview.
