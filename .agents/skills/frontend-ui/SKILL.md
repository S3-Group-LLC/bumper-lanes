---
name: frontend-ui
description: Builds and changes what people see — pages, forms, buttons, layout, colours and styling — with React, Next.js 16 and Tailwind CSS v4, so the result is accessible, works on phones and builds offline. Use when the learner asks to add or change a page, section, form, button, menu, layout, colours, fonts or "make it look nicer".
---

# Front-end UI

Make pages that look good, work for everyone (including keyboard and screen-reader users), and
work on a phone first. Parts of this skill are adapted from openly licensed guides — see
[LICENSES/NOTICE.md](LICENSES/NOTICE.md).

## Before you start

- **Big visual changes: agree the look first.** Ask about the feel (friendly, bold, calm…),
  colours they like or must use (a logo?), and an example site they admire. Describe your plan
  in two or three sentences before building. Small tweaks don't need this.
- Read `src/app/globals.css` (colour and font tokens) and `src/app/layout.tsx` (header, footer)
  so new work matches what's there.
- Next.js 16 differs from older versions: check `node_modules/next/dist/docs/` for anything
  Next.js-specific (routing, images, forms, loading states).

## Rules that always apply

1. **Fonts: system fonts or a font file saved in the project — never `next/font/google` or a
   font CDN.** Downloads during the build break offline builds (Codex), and `npm run lint` will
   fail on `next/font/google`. Change `--font-sans` in `globals.css`, or save the font file in
   the project and use `next/font/local`.
2. **Text contrast at least 4.5:1** against its background (3:1 for large text, icons, focus
   rings and **form-field borders**). The usual failures, and fixes on a white background:
   input borders `border-black/20` (1.6:1) → `border-black/50`; Tailwind's default placeholder
   (3.3:1) → `placeholder:text-black/60`; light grey text → `text-black/70` or darker.
3. **Mobile first.** Design for a 375px phone, then add `sm:`/`md:` styles. Nothing scrolls
   sideways. Tap targets at least 24×24px.
4. **Every input has a visible label; every clickable thing is a `<button>` or a link and shows
   a focus ring** (`focus-visible:ring-2`).
5. **Tailwind v4 only:** utilities in JSX, design tokens in `@theme` in `globals.css`. Never
   create `tailwind.config.js`; avoid `@apply`. See [Tailwind v4 notes](references/tailwind-v4.md).
6. **Server Components by default;** add `"use client"` only to the small part that needs
   clicks or state. See [React essentials](references/react.md).

## How to build it

1. Plan the page: the sections, in order, on a phone.
2. Reuse what exists (header, colours, the card style on `/status`); make small components in
   `src/app/` or `src/components/` rather than one huge file.
3. Write plain, specific text: "Send message", "Saved!", errors that say how to fix them.
4. Check against the [UI guidelines](references/ui-guidelines.md) — especially accessibility,
   forms and the "things to flag" list.
5. Run `npm run lint`, `npm test` and `npm run build`; make sure `/status` still renders.
6. Add a line to `CHANGELOG.md` and use **ship-it** — the learner checks the preview on their
   phone and computer before merging.

## Forms that save data

A form needs somewhere to store submissions: use **add-data** first (merge it), then build the
form. Validate input on the server as well as in the browser, and show a clear success message.
