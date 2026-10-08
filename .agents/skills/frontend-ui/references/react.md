<!-- Adapted from https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices (selected rules, MIT, © Vercel) — modified by S3 Group LLC (2026). See ../LICENSES/NOTICE.md -->

# React and Next.js essentials

Ten habits that matter most in this project (Next.js 16 App Router, React 19). For anything
Next.js-specific, read the matching guide in `node_modules/next/dist/docs/` — it matches the
exact version installed.

1. **Server Components by default.** Files in `src/app/` render on the server unless they start
   with `"use client"`. Only add `"use client"` to the small piece that needs clicks, state or
   browser APIs — not to whole pages.

2. **Keep client props small.** Whatever a Server Component passes to a Client Component is sent
   to the browser. Pass the few fields it needs, not whole database rows (and never secrets).

3. **Fetch independent things at the same time.**
   ```ts
   const [specials, hours] = await Promise.all([getSpecials(), getHours()]);
   ```
   not one `await` after another.

4. **Show something while slow parts load.** Wrap a slow section in `<Suspense fallback={…}>`
   (or add a `loading.tsx`) so the rest of the page appears immediately.

5. **Never define a component inside another component.** It's recreated on every render, losing
   its state and focus. Define components at the top level of the file.

6. **Derive, don't sync.** If a value can be calculated from props or state, calculate it during
   render. Don't copy it into state with `useEffect`.
   ```tsx
   const total = items.reduce((sum, i) => sum + i.price, 0); // not useEffect + setTotal
   ```

7. **Put interaction logic in event handlers**, not in effects that watch state. "When the
   button is clicked, send the form" belongs in `onClick`/`onSubmit`.

8. **Conditional rendering with a ternary when the left side can be `0`.**
   `{count > 0 ? <Badge n={count} /> : null}` — `{count && …}` renders a stray `0`.

9. **Load heavy widgets only when needed.** Big browser-only pieces (maps, charts, editors) load
   with `next/dynamic` **inside a Client Component** (a file starting with `"use client"`):
   `const Map = dynamic(() => import("./map"), { ssr: false })`. Using `ssr: false` in a
   Server Component is an error in Next.js 16 (see `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`).
   Import from the specific file, not a big "index" barrel file.

10. **Server Actions are public.** A function with `"use server"` can be called by anyone, like
    a web address. Check who's signed in and what they're allowed to do **inside** the action,
    and validate the input — don't rely on the page having checked. (Row Level Security in
    Supabase is the second line of defence.)
