import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// DECISIONS.md: CHANGELOG.md says what changed; DECISIONS.md says why.
const read = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8');

describe('DECISIONS.md — why things are the way they are', () => {
  const decisions = read('DECISIONS.md');

  it('explains the format: why, other options, trade-offs, who decided, status', () => {
    for (const field of ['Why', 'Other options', 'Trade-offs', 'Decided by', 'Status']) {
      expect(decisions).toContain(`**${field}:**`);
    }
    expect(decisions).toMatch(/## YYYY-MM-DD — /);
  });

  it('starts with an example entry about pull requests and previews', () => {
    expect(decisions).toMatch(/^## .*pull request with a preview$/m);
  });

  it('AGENTS.md asks for an entry for significant decisions and overruled rules', () => {
    const agents = read('AGENTS.md');
    expect(agents).toMatch(/add an entry to `DECISIONS\.md` saying why/);
    expect(agents).toMatch(/add a `DECISIONS\.md` entry/);
  });

  it('explain-that answers "why did we…?" from it; capture-learning proposes entries', () => {
    expect(read('.agents/skills/explain-that/SKILL.md')).toMatch(/"why did we…\?".*`DECISIONS\.md`/s);
    expect(read('.agents/skills/capture-learning/SKILL.md')).toMatch(/significant decisions.*`DECISIONS\.md`/s);
  });

  it('is listed in the README and the glossary', () => {
    expect(read('README.md')).toContain('`DECISIONS.md`');
    expect(read('GLOSSARY.md')).toContain('**DECISIONS.md**');
  });
});
