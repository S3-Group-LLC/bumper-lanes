import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ESLint } from 'eslint';

// Guard the frontend-ui skill's essentials and the offline-font lint rule.
const root = resolve(__dirname, '..');
const dir = join(root, '.agents/skills/frontend-ui');
const read = (f: string) => readFileSync(join(dir, f), 'utf8');

describe('frontend-ui skill', () => {
  it('keeps the offline-font and WCAG AA contrast rules', () => {
    const skill = read('SKILL.md');
    expect(skill).toMatch(/never `next\/font\/google`/);
    expect(skill).toMatch(/contrast at least 4\.5:1/);
    expect(read('references/ui-guidelines.md')).toMatch(/Text contrast at least 4\.5:1/);
    // Concrete fixes for the two failures found when testing a contact form.
    expect(skill).toMatch(/form-field borders/);
    expect(skill).toMatch(/placeholder:text-black\/60/);
  });

  it('teaches Tailwind v4 and Next.js 16, not v3 / Pages Router habits', () => {
    const tailwind = read('references/tailwind-v4.md');
    expect(tailwind).toMatch(/never create one/);
    expect(tailwind).toMatch(/Avoid `@apply`/);
    const all = ['SKILL.md', 'references/ui-guidelines.md', 'references/tailwind-v4.md', 'references/react.md'].map(read).join('\n');
    expect(all).not.toMatch(/pages\/_app|getServerSideProps|getStaticProps/);
    // v3 directives may only appear as a warning ("No `@tailwind …`"), never as advice.
    const tailwindDirectiveLines = all.split('\n').filter((l) => /@tailwind (base|components|utilities)/.test(l));
    expect(tailwindDirectiveLines.every((l) => /\bNo `@tailwind/.test(l))).toBe(true);
    expect(read('references/react.md')).toMatch(/inside a Client Component/); // ssr:false rule for Next 16
    expect(read('references/ui-guidelines.md')).toMatch(/`preload`/); // priority is deprecated in Next 16
  });

  it('ships the licence texts and attributes every adapted file', () => {
    for (const f of ['NOTICE.md', 'MIT-vercel-labs-web-interface-guidelines.txt', 'MIT-vercel-labs-agent-skills.txt', 'Apache-2.0-joe-bell-cva.txt']) {
      expect(existsSync(join(dir, 'LICENSES', f)), f).toBe(true);
    }
    expect(read('LICENSES/Apache-2.0-joe-bell-cva.txt')).toMatch(/Apache License\s+Version 2\.0/);
    for (const f of ['ui-guidelines.md', 'tailwind-v4.md', 'react.md']) {
      expect(read(`references/${f}`).split('\n')[0]).toMatch(/^<!-- Adapted from https:\/\/github\.com\/.+ — modified by S3 Group LLC \(2026\)/);
    }
  });
});

describe('offline-font lint rule', () => {
  const eslint = new ESLint({ cwd: root });
  const lint = async (code: string) =>
    (await eslint.lintText(code, { filePath: join(root, 'src/app/font-check.tsx') }))[0].messages.map((m) => m.ruleId);

  it('blocks next/font/google', async () => {
    expect(await lint('import { Inter } from "next/font/google";\nexport const inter = Inter({ subsets: ["latin"] });\n')).toContain('no-restricted-imports');
  });

  it('allows next/font/local', async () => {
    expect(await lint('import localFont from "next/font/local";\nexport const f = localFont({ src: "./my-font.woff2" });\n')).not.toContain('no-restricted-imports');
  });
});
