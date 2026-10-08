import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createSkill, proposalProblems } from '../scripts/new-skill.mjs';
import { checkProject } from '../scripts/check-skills.mjs';

const root = resolve(__dirname, '..');
const skill = (name: string) => readFileSync(join(root, '.agents/skills', name, 'SKILL.md'), 'utf8');

/** The two-sentence explanation every skill (and the docs) must give word-for-word. */
export const SKILLS_VS_MEMORY =
  "AGENTS.md is the rulebook your agent reads at the start of every session; skills are step-by-step playbooks it opens only when a task needs them. Both are files in your project — saved, reviewable in a pull request, undoable, and used by any agent you open it with — while an agent's memory is hidden, can't be reviewed, and doesn't travel with your project.";
const flat = (s: string) => s.replace(/\*\*|`/g, '').replace(/\s+/g, ' ');

describe('new-skill scaffolding', () => {
  let project: string;
  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), 'new-skill-'));
    mkdirSync(join(project, '.agents', 'skills'), { recursive: true });
    cpSync(join(root, '.agents/skills/new-skill'), join(project, '.agents/skills/new-skill'), { recursive: true });
  });
  afterEach(() => rmSync(project, { recursive: true, force: true }));

  it('creates a skill the validator accepts, linked for Claude Code and visible to Codex', () => {
    createSkill(project, 'weekly-newsletter', 'Writes the weekly bakery newsletter from this week\'s specials. Use when the learner asks to write or draft the newsletter.');
    expect(existsSync(join(project, '.agents/skills/weekly-newsletter/SKILL.md'))).toBe(true);
    expect(existsSync(join(project, '.agents/skills/weekly-newsletter/TESTING.md'))).toBe(true);
    expect(lstatSync(join(project, '.claude/skills/weekly-newsletter')).isSymbolicLink()).toBe(true);
    const { skills, problems } = checkProject(project);
    expect(problems).toEqual([]);
    expect(skills).toContain('weekly-newsletter');
    expect(readFileSync(join(project, '.agents/skills/weekly-newsletter/SKILL.md'), 'utf8')).toMatch(/^# Weekly Newsletter$/m);
  });

  it('writes tricky descriptions (quotes, colons, #) as valid YAML', () => {
    createSkill(project, 'price-list', 'Updates the "Prices: 2026" page #menu. Use when the learner says: change a price.');
    expect(checkProject(project).problems).toEqual([]);
  });

  it('never overwrites an existing skill', () => {
    createSkill(project, 'my-skill', 'Does a thing. Use when the learner asks for the thing.');
    expect(() => createSkill(project, 'my-skill', 'Other. Use when the learner asks for other.')).toThrow(/already exists/);
  });

  it.each([
    ['Weekly Newsletter', 'Writes it. Use when asked.', /lowercase words/],
    ['newsletter', '', /description is needed/],
    ['newsletter', 'Writes the newsletter.', /say WHEN to use/],
    ['newsletter', 'x'.repeat(1100) + ' Use when asked.', /max 1024/],
  ])('rejects name %j / description %j', (name, description, message) => {
    expect(proposalProblems(name, description).join('; ')).toMatch(message);
  });
});

describe('skills vs memory, explained consistently', () => {
  it.each(['new-skill', 'capture-learning'])('%s gives the same two-sentence explanation', (name) => {
    expect(flat(skill(name))).toContain(SKILLS_VS_MEMORY);
  });

  it('capture-learning never settles for "just remember it"', () => {
    const s = skill('capture-learning');
    expect(s).toMatch(/Never answer with "I'll remember that\."/);
    expect(s).toMatch(/AGENTS\.md/);
    expect(s).toMatch(/\*\*new-skill\*\*/);
    expect(s).toMatch(/\*\*ship-it\*\*/);
  });
});
