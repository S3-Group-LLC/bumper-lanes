---
name: new-skill
description: Creates a new skill — a reusable, step-by-step playbook for a job the learner keeps asking for — from a template, with a description that triggers reliably, test prompts and a pull request. Use when the learner says "make a skill", "teach yourself to…", "I keep asking you to…", "save this as a skill", or when capture-learning suggests a new skill.
---

# New skill

A skill is a playbook your agent opens when a task matches it. Explain the idea briefly first,
in these words:

> AGENTS.md is the rulebook your agent reads at the start of every session; skills are step-by-step playbooks it opens only when a task needs them. Both are files in your project — saved, reviewable in a pull request, undoable, and used by any agent you open it with — while an agent's memory is hidden, can't be reviewed, and doesn't travel with your project.

## 1. Interview

Ask, one or two at a time:

1. "What job do you keep asking me to do?" (e.g. "write the weekly newsletter")
2. "Walk me through how it should be done — what goes in, what comes out?"
3. "What usually goes wrong, or what do you always have to remind me about?"
4. "What would you naturally say when you want it?" (these words go into the description)

If the answer is really a rule for **every** task (e.g. "always use British spelling"), say so:
that belongs in `AGENTS.md`, not a skill. If a skill for this job already exists, improve that
one instead.

## 2. Name and description

- **Name:** short, lowercase, hyphens — `weekly-newsletter`, `add-product`. It becomes the
  folder name.
- **Description:** this is how the agent decides to use the skill, so write it carefully:
  - say **what it does** and **when to use it**, in one or two sentences;
  - include the words the learner would actually say ("Use when the learner asks to write,
    draft or send the newsletter…");
  - be specific — "Writes the weekly bakery newsletter from this week's specials" beats
    "Helps with emails";
  - at most 1024 characters.

## 3. Create it

Run: `npm run new-skill -- <name> "<description>"`

It creates `.agents/skills/<name>/SKILL.md` and `TESTING.md` from the template, links the skill
for Claude Code, and checks it. Then fill in `SKILL.md`:

- **Steps** — numbered, concrete: which files, which commands, what to ask the learner.
- **Rules** — what to always or never do for this job (including the guard rails in `AGENTS.md`
  that matter here).
- **Example** — one short example of a request and a good result.

Keep it under about 100 lines; put long reference material in a `references/` file and link to
it. Remove the template's `<!-- -->` hints once each part is written.

## 4. Test prompts

Fill in `TESTING.md`: two or three things the learner might say that **should** use the skill,
and one similar request that **shouldn't**. Suggest the learner tries them in a new session
after merging.

## 5. Check and ship

- `npm run check:skills` must pass (it also runs inside `npm test`).
- Add a line to `CHANGELOG.md` ("Added a skill for writing the weekly newsletter").
- Open a pull request with **ship-it**. In the summary, say in plain English what the skill does
  and when it'll be used. Once merged, it works in both Claude Code and Codex.
