---
name: capture-learning
description: End-of-session retro — looks at what took several tries or went wrong, and turns the lesson into a written improvement (a rule in AGENTS.md, an updated skill, or a new skill) proposed as a pull request, instead of "just remembering it". Use when the learner says "let's wrap up", "end of session", "what did we learn?", "remember this for next time", "don't make that mistake again", or after something needed several attempts.
---

# Capture learning

Agents don't reliably remember between sessions — and even when they do, nobody can review it.
So lessons get **written into the project**. Explain why, in these words:

> AGENTS.md is the rulebook your agent reads at the start of every session; skills are step-by-step playbooks it opens only when a task needs them. Both are files in your project — saved, reviewable in a pull request, undoable, and used by any agent you open it with — while an agent's memory is hidden, can't be reviewed, and doesn't travel with your project.

**Never answer with "I'll remember that."** Turn it into a file change, or explain why nothing
needs to change.

## 1. Look back at the session

Find the friction, from the conversation and from `git log --oneline -15` / `CHANGELOG.md`:

- What took **several tries**? (a failing build, a check that kept failing, a misunderstanding)
- What did the learner have to **correct or repeat**?
- What went wrong, and **what rule or procedure would have prevented it**?

Ask the learner too: "Was there anything you had to tell me more than once, or anything that
felt harder than it should?" Pick the **one or two** lessons that matter most.

## 2. Choose where each lesson goes

| The lesson is… | Put it in | Example |
|---|---|---|
| A rule for **every** task | `AGENTS.md` (keep it short; it stays under ~150 lines) | "Use British spelling in everything." |
| About **one kind of job** that already has a skill | That skill's `SKILL.md` | add-data: "Always add a `done` flag to to-do tables." |
| A **repeated job** with no skill yet | A new skill — use **new-skill** | "Write the weekly newsletter." |
| A **fact about the project** | `PROJECT.md` | "Orders close Friday 6pm." |
| A one-off that won't happen again | Nothing — say so | — |

Write the change **specifically**, as an instruction: not "be careful with fonts" but "Use the
system font stack; never `next/font/google` — builds must work offline."

## 3. Propose it as a pull request

Make the change on a branch, run `npm test` (it checks skills), add a line to `CHANGELOG.md`,
and open a pull request with **ship-it**. Use this summary:

```markdown
## What happened
<plain English: what took several tries or went wrong>

## What changes
<the rule/skill/fact added, and the file>

## Why a file, not memory
It's written into the project, so every future session — in Claude Code or Codex — follows it,
and you can review or undo it like any other change.
```

The learner decides: merging makes it permanent; closing the pull request drops it.
