<!-- Adapted from https://github.com/joe-bell/cva/blob/main/.agents/skills/tailwind-css-v4/SKILL.md (Apache-2.0, © 2022-present Joe Bell) — modified by S3 Group LLC (2026). See ../LICENSES/NOTICE.md -->

# Tailwind CSS v4 in this project

This project uses **Tailwind CSS v4**. Many tutorials (and older AI habits) show v3 — don't
use v3 syntax.

## Setup — already done, don't change it

- Styles start with `@import "tailwindcss";` in `src/app/globals.css`.
- PostCSS uses `@tailwindcss/postcss` (`postcss.config.mjs`).
- **There is no `tailwind.config.js` — never create one.** No `@tailwind base/components/utilities`.

## Colours, fonts and other design tokens

Tokens live in `src/app/globals.css`, inside `@theme`. Each token becomes utility classes:

```css
:root {
  --accent: #5855a5;
}

@theme inline {
  --color-accent: var(--accent);          /* → bg-accent, text-accent, border-accent */
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --radius-card: 0.75rem;                 /* → rounded-card */
}
```

- Namespaces: `--color-*`, `--font-*`, `--text-*` (sizes), `--radius-*`, `--shadow-*`,
  `--breakpoint-*`, `--spacing` (base unit; `mt-21` works without config).
- Change the look by editing these tokens, not by scattering hex codes through components.
- Use a token in an arbitrary value with parentheses: `bg-(--accent)` (v3 used `bg-[--accent]`).

## v3 → v4 differences that trip people up

| v3 (don't) | v4 (do) |
|---|---|
| `tailwind.config.js` theme | `@theme` in `globals.css` |
| `bg-opacity-50`, `text-opacity-*` | `bg-black/50`, `text-white/80` |
| `shadow-sm` / `shadow` | `shadow-xs` / `shadow-sm` |
| `rounded-sm` / `rounded` | `rounded-xs` / `rounded-sm` |
| `blur-sm` / `blur` | `blur-xs` / `blur-sm` |
| `outline-none` | `outline-hidden` (and add a `focus-visible:` ring) |
| `bg-gradient-to-r` | `bg-linear-to-r` |
| `theme('colors.x')` | `var(--color-x)` |

Other v4 defaults: borders use the current text colour (set `border-black/10` etc. explicitly),
`ring` is 1px by default, and `hover:` only applies on devices that can hover.

## Good habits

- Prefer utility classes in JSX. **Avoid `@apply`** — make a small React component instead.
- Container queries are built in: `@container` on the parent, `@sm:` / `@md:` on children.
- Dark mode, if wanted: `dark:` variants (follows the system setting by default).
