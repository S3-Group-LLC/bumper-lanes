<!-- Adapted from https://github.com/vercel-labs/web-interface-guidelines (command.md, MIT, © 2025 Vercel Labs) — modified by S3 Group LLC (2026). See ../LICENSES/NOTICE.md -->

# UI guidelines

Check new or changed pages against these before calling them done.

## Accessibility

- **Text contrast at least 4.5:1** against its background (WCAG AA); 3:1 for large text (24px+,
  or 19px+ bold) and for icons, focus rings and the borders of inputs and buttons. On white:
  `border-black/50` (≈4:1) passes, `border-black/20` (1.6:1) fails; set placeholders to
  `placeholder:text-black/60` (Tailwind's default is only ≈3.3:1). Don't rely on colour alone to
  show meaning (add text or an icon).
- Use the right element: `<button>` for actions, `<a>`/`<Link>` for navigation — never a
  clickable `<div>`. Native elements are keyboard-friendly for free.
- Every form control has a visible `<label>` (or `aria-label` if there's truly no room).
- Icon-only buttons need `aria-label`; decorative icons get `aria-hidden="true"`.
- Images need `alt` (`alt=""` if purely decorative).
- Headings go in order (`<h1>` → `<h2>` → `<h3>`), one `<h1>` per page.
- Messages that appear after an action (saved, error) use `aria-live="polite"`.
- Tap/click targets at least 24×24px (aim for 44×44 on mobile).
- `<html lang="…">` is set (it is in `src/app/layout.tsx`).

## Focus

- Everything clickable shows a visible focus ring: `focus-visible:ring-2 focus-visible:ring-…`.
- Never remove the outline (`outline-hidden` / `outline: none`) without a replacement.
- Prefer `focus-visible:` over `focus:` (no ring on mouse click).
- Sticky headers and pop-ups must not cover the focused element.

## Forms

- Use the right `type` (`email`, `tel`, `url`, `number`) and a sensible `autocomplete` and `name`.
- Labels are clickable (`htmlFor`, or wrap the input).
- Never block paste.
- Turn off spellcheck on emails and codes (`spellCheck={false}`).
- The submit button stays enabled until the request starts; show "Sending…" while it runs.
- Show errors next to the field, say how to fix them, and move focus to the first error.
- Placeholders show an example (`you@example.com`), never replace the label.

## Layout and content

- Mobile first: design for a 375px-wide phone, then add `sm:`/`md:` styles. No sideways scrolling.
- Handle long and empty content: `break-words`, `truncate`/`line-clamp-*`, and a friendly
  empty state instead of a blank or broken page.
- Flex children that hold text need `min-w-0` so text can wrap or truncate.
- Use flex/grid for layout, not JavaScript measuring.

## Images

- Use `next/image` (or give `<img>` a `width` and `height`) so the page doesn't jump.
- Below-the-fold images load lazily; the main hero image can use `preload` (Next.js 16 —
  the older `priority` prop is deprecated).

## Motion

- Respect reduced motion: `motion-safe:` / `motion-reduce:` variants.
- Animate `transform` and `opacity` only; never `transition: all` (list the properties).

## Navigation and state

- Things people would want to share or bookmark (filters, tabs, pages) belong in the URL.
- Destructive actions (delete) ask for confirmation or offer undo — never instant.

## Writing on the page

- Plain, active voice: "Send message", not "Submission will be processed".
- Specific button labels: "Save changes", not "OK" or "Continue".
- Error messages say what to do next, not just what went wrong.
- Loading text ends with "…": "Loading…", "Saving…".
- Use `Intl.DateTimeFormat` / `Intl.NumberFormat` for dates, prices and numbers.

## Things to flag

- Zoom disabled (`user-scalable=no`, `maximum-scale=1`)
- Inputs without labels; icon buttons without `aria-label`
- Clickable `<div>`/`<span>`; navigation done with `onClick` instead of a link
- `outline-hidden` with no focus style; `transition: all`
- Images without dimensions
- Text that fails 4.5:1 contrast (light grey on white is the usual culprit)
