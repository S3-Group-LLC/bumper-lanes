# Decisions

Why your project is the way it is. `CHANGELOG.md` says **what** changed; this file says
**why** — the important choices, what else was considered, and what you gave up.

Your agent adds an entry whenever a significant decision is made: choosing a tool or library,
how your data is organised, a security or privacy choice, or skipping one of the rules in
`AGENTS.md`. Ask it "why did we…?" any time — it will answer from here. Newest first.

Each entry looks like this:

```markdown
## YYYY-MM-DD — The decision, in one line

- **Why:** the reason, in plain English
- **Other options:** what else we considered
- **Trade-offs:** what we gave up, or what to watch out for
- **Decided by:** you / your agent / both
- **Status:** current (or "replaced by …" with the date)
```

## Getting started — Every change goes through a pull request with a preview

- **Why:** you can try each change on a private preview before it goes live, and any change
  can be undone on its own.
- **Other options:** changing the live site directly (faster, but mistakes go live straight away
  and are harder to undo).
- **Trade-offs:** each change takes a few more clicks (open the preview, then merge). You can
  skip it for a change by asking — your agent will tell you the risk first.
- **Decided by:** the Bumper Lanes starter kit
- **Status:** current
