import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildShareLink, parseProject, MAX_URL_LENGTH, SHARE_URL } from '../scripts/share-link.mjs';
import { configProblems, projectIsPlaceholder, runChecks, formatReport } from '../scripts/doctor.mjs';

const root = resolve(__dirname, '..');
const skill = (name: string) => readFileSync(join(root, '.agents/skills', name, 'SKILL.md'), 'utf8');

const PROJECT = `# Crumb & Co Orders

## The idea
An order form for my bakery so regulars can pre-order bread & pastries for Saturday.

## The problem it solves
Orders come in by text and I lose track — "50% of Saturdays" something gets missed.

## Who it's for
Regular customers, and me on Friday night.

## What success looks like
No missed orders for a month.

## Information it needs to keep
Customers, orders (items, quantity, pickup time).

## First version
- An order form
- A list of Saturday's orders for me

## Later ideas
- _Good ideas for after the first version_
`;

describe('share link (start-my-project)', () => {
  it('reads the project name and filled-in sections, skipping placeholders', () => {
    const { name, sections } = parseProject(PROJECT);
    expect(name).toBe('Crumb & Co Orders');
    expect(Object.keys(sections)).toEqual([
      'The idea', 'The problem it solves', 'Who it\'s for', 'What success looks like', 'Information it needs to keep', 'First version',
    ]);
  });

  it('builds a v1 link to hellos3.com with everything URL-encoded', () => {
    const { url, shortened } = buildShareLink(PROJECT);
    expect(url.startsWith(`${SHARE_URL}?v=1&src=kit&project=`)).toBe(true);
    expect(url).not.toMatch(/[ &]Co|%%|\n/); // spaces, & and newlines are encoded
    const params = new URL(url).searchParams;
    expect(params.get('project')).toBe('Crumb & Co Orders');
    expect(params.get('brief')).toContain('"50% of Saturdays"');
    expect(params.get('brief')).toContain('Customers, orders (items, quantity, pickup time).');
    expect(shortened).toBe(false);
  });

  it('keeps long briefs under the length cap, ending in …, with the full text as fallback', () => {
    const long = PROJECT.replace('No missed orders for a month.', 'Words go here. '.repeat(400));
    const { url, brief, shortened } = buildShareLink(long);
    expect(url.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
    expect(shortened).toBe(true);
    expect(new URL(url).searchParams.get('brief')!.endsWith('…')).toBe(true);
    expect(brief.length).toBeGreaterThan(5000); // copy-paste version is complete
  });

  it('refuses to build a link from the placeholder', () => {
    expect(() => buildShareLink(readFileSync(join(root, 'PROJECT.md'), 'utf8'))).toThrow(/start-my-project/);
  });
});

describe('doctor checks', () => {
  it('accepts the template config and explains bad values', () => {
    expect(configProblems(readFileSync(join(root, 'bumper-lanes.config.yaml'), 'utf8'))).toEqual([]);
    expect(configProblems('environment: staging\nagent: cursor\nbackups:\n  retention_days: 400\n')).toEqual([
      '"environment" should be prod-only (got "staging")',
      '"agent" should be claude-code or codex (got "cursor")',
      '"backups.retention_days" should be a whole number from 1 to 90 (got 400)',
    ]);
    expect(configProblems('a: [oops')[0]).toMatch(/isn't valid YAML/);
  });

  it('spots a placeholder PROJECT.md', () => {
    expect(projectIsPlaceholder(readFileSync(join(root, 'PROJECT.md'), 'utf8'))).toBe(true);
    expect(projectIsPlaceholder(PROJECT)).toBe(false);
  });

  it('reports missing Supabase settings as something to check on /status, and a filled-in project as OK', () => {
    const dir = mkdtempSync(join(tmpdir(), 'doctor-'));
    try {
      for (const f of ['bumper-lanes.config.yaml', '.env.example', '.gitignore', 'package-lock.json']) cpSync(join(root, f), join(dir, f));
      cpSync(join(root, '.agents'), join(dir, '.agents'), { recursive: true, verbatimSymlinks: true });
      cpSync(join(root, '.claude'), join(dir, '.claude'), { recursive: true, verbatimSymlinks: true });
      writeFileSync(join(dir, 'PROJECT.md'), PROJECT);
      const results = runChecks(dir, {});
      const byTitle = Object.fromEntries(results.map((r: { title: string; status: string }) => [r.title, r.status]));
      expect(byTitle['PROJECT.md']).toBe('ok');
      expect(byTitle['bumper-lanes.config.yaml']).toBe('ok');
      expect(byTitle['Supabase settings for the app']).toBe('check');
      expect(byTitle['Project set up']).toBe('fail'); // no node_modules in the copy
      expect(formatReport(results)).toMatch(/→ Run: bash scripts\/setup\.sh/);
      const withEnv = runChecks(dir, { NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'k' });
      expect(withEnv.find((r: { title: string }) => r.title === 'Supabase settings for the app')!.status).toBe('ok');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('core skills keep their promises', () => {
  it('start-my-project never sends anything itself', () => {
    const s = skill('start-my-project');
    expect(s).toMatch(/npm run share-link/);
    expect(s).toMatch(/Don't send anything yourself, don't open the\s+link for them, and don't call any website/);
    expect(s).not.toMatch(/curl |fetch\(|gh api/);
  });

  it("ship-it doesn't merge on its own, but merges if the learner clearly asks", () => {
    const s = skill('ship-it');
    expect(s).toMatch(/\*\*You don't merge on your own\*\*/);
    expect(s).toMatch(/If they\s+clearly ask you to merge it for them/);
    expect(s).toMatch(/say once that this publishes to the live\s+site/);
    expect(s).not.toMatch(/even if asked/i);
    expect(s).not.toMatch(/--auto|git push origin main/);
    expect(s).toMatch(/Merging = publishing/);
  });

  it('doctor covers missing Supabase settings, a missing GitHub secret, and a paused project', () => {
    const s = skill('doctor');
    expect(s).toMatch(/Not connected yet/);
    expect(s).toMatch(/Redeploy/);
    expect(s).toMatch(/New repository secret/);
    expect(s).toMatch(/paused/);
    expect(s).toMatch(/Restore project/);
    expect(s).toMatch(/Never ask the learner to paste a secret into the chat/);
  });

  it('explain-that grows GLOSSARY.md (which exists)', () => {
    expect(skill('explain-that')).toMatch(/GLOSSARY\.md/);
    expect(readFileSync(join(root, 'GLOSSARY.md'), 'utf8')).toMatch(/^- \*\*Branch\*\* — /m);
  });
});
