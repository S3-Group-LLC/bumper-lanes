import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkProject, validateSkill } from '../scripts/check-skills.mjs';
import { syncSkills } from '../scripts/sync-skills.mjs';

let root: string;

const skillMd = (name: string, description = `Does ${name} things. Use when testing.`, body = '\n# Steps\n\n1. Do it.\n') =>
  `---\nname: ${name}\ndescription: ${description}\n---\n${body}`;

/** Writes .agents/skills/<folder>/SKILL.md (plus extra files) in the temp project. */
function addSkill(folder: string, content = skillMd(folder), extra: Record<string, string> = {}) {
  const dir = join(root, '.agents', 'skills', folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), content);
  for (const [file, text] of Object.entries(extra)) {
    mkdirSync(join(dir, file, '..'), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  return dir;
}

const problemsFor = (folder: string, content: string, extra?: Record<string, string>) =>
  validateSkill(addSkill(folder, content, extra)) as string[];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skills-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('validateSkill (Agent Skills SKILL.md format)', () => {
  it('accepts a valid skill', () => {
    expect(problemsFor('good-skill', skillMd('good-skill'))).toEqual([]);
  });

  it('accepts optional fields and multi-line descriptions', () => {
    const content = `---\nname: fancy\ndescription: >\n  Long description\n  over two lines.\nlicense: MIT\nmetadata:\n  author: s3\n---\n# Body\n`;
    expect(problemsFor('fancy', content)).toEqual([]);
  });

  it('rejects a missing SKILL.md', () => {
    mkdirSync(join(root, 'empty'));
    expect(validateSkill(join(root, 'empty'))).toEqual(['empty: missing SKILL.md']);
  });

  it('rejects missing frontmatter', () => {
    expect(problemsFor('no-fm', '# Just a heading\n')[0]).toMatch(/frontmatter/);
  });

  it('rejects invalid YAML in the frontmatter', () => {
    expect(problemsFor('bad-yaml', '---\nname: [oops\n---\nbody\n')[0]).toMatch(/not valid YAML/);
  });

  it('rejects a missing description', () => {
    expect(problemsFor('no-desc', '---\nname: no-desc\n---\nbody\n')).toEqual([
      'no-desc: frontmatter needs a "description" saying what the skill does and when to use it',
    ]);
  });

  it('rejects a missing name', () => {
    expect(problemsFor('no-name', '---\ndescription: hi\n---\nbody\n')[0]).toMatch(/needs a "name"/);
  });

  it('rejects a name that does not match the folder', () => {
    expect(problemsFor('folder-name', skillMd('other-name'))).toEqual([
      'folder-name: "name" is "other-name" but the folder is "folder-name" — they must match',
    ]);
  });

  it.each(['Hello', '-hello', 'hello-', 'hel--lo', 'hello_world'])('rejects the invalid name "%s"', (name) => {
    expect(problemsFor(name, skillMd(name)).join()).toMatch(/lowercase letters/);
  });

  it('rejects names over 64 characters', () => {
    const name = 'a'.repeat(65);
    expect(problemsFor(name, skillMd(name)).join()).toMatch(/max 64/);
  });

  it('rejects descriptions over 1024 characters', () => {
    expect(problemsFor('wordy', skillMd('wordy', 'x'.repeat(1025))).join()).toMatch(/max 1024/);
  });

  it('rejects a skill with no instructions', () => {
    expect(problemsFor('hollow', skillMd('hollow', 'Hi.', '\n'))).toEqual([
      'hollow: SKILL.md has no instructions after the frontmatter',
    ]);
  });

  it('checks that linked files exist, ignoring web links and anchors', () => {
    const body = '\nSee [guide](references/guide.md), [missing](references/nope.md), [web](https://x.y) and [top](#top).\n';
    expect(problemsFor('links', skillMd('links', 'Hi.', body), { 'references/guide.md': '# Guide' })).toEqual([
      'links: links to "references/nope.md", which doesn\'t exist',
    ]);
  });
});

describe('checkProject: Claude Code and Codex see the same skills', () => {
  it('passes when every skill is linked (after sync)', () => {
    addSkill('one');
    addSkill('two');
    syncSkills(root);
    expect(checkProject(root)).toEqual({ skills: ['one', 'two'], problems: [] });
  });

  it('passes when .claude/skills links the whole folder', () => {
    addSkill('one');
    mkdirSync(join(root, '.claude'));
    symlinkSync('../.agents/skills', join(root, '.claude', 'skills'));
    expect(checkProject(root).problems).toEqual([]);
  });

  it('fails when a new skill has no link (drift)', () => {
    addSkill('one');
    syncSkills(root);
    addSkill('two');
    expect(checkProject(root).problems).toEqual([
      'two: Claude Code can\'t see this skill — .claude/skills/two is missing. Run "npm run sync:skills" to fix.',
    ]);
  });

  it('fails when a copied skill differs from the original (drift)', () => {
    addSkill('one');
    const copy = join(root, '.claude', 'skills', 'one');
    mkdirSync(copy, { recursive: true });
    writeFileSync(join(copy, 'SKILL.md'), skillMd('one', 'Edited in the wrong place.'));
    expect(checkProject(root).problems).toEqual(['one: SKILL.md is different in .claude/skills']);
  });

  it('accepts an identical copy', () => {
    addSkill('one');
    const copy = join(root, '.claude', 'skills', 'one');
    mkdirSync(copy, { recursive: true });
    writeFileSync(join(copy, 'SKILL.md'), skillMd('one'));
    expect(checkProject(root).problems).toEqual([]);
  });

  it('fails when a skill exists only in .claude/skills', () => {
    addSkill('one');
    syncSkills(root);
    mkdirSync(join(root, '.claude', 'skills', 'claude-only'));
    expect(checkProject(root).problems.join()).toMatch(/only in \.claude\/skills, so Codex can't see it/);
  });

  it('fails on a link left over from a deleted skill', () => {
    addSkill('one');
    addSkill('gone');
    syncSkills(root);
    rmSync(join(root, '.agents', 'skills', 'gone'), { recursive: true });
    expect(checkProject(root).problems.join()).toMatch(/gone: .*left over/);
  });

  it('reports invalid skills and missing folders', () => {
    addSkill('broken', '# no frontmatter\n');
    syncSkills(root);
    expect(checkProject(root).problems[0]).toMatch(/broken: SKILL.md must start with frontmatter/);
    expect(checkProject(mkdtempSync(join(tmpdir(), 'none-'))).problems).toEqual(['.agents/skills folder is missing']);
  });
});

describe('syncSkills', () => {
  it('creates relative links, removes dead ones, and never deletes real folders', () => {
    addSkill('one');
    addSkill('gone');
    syncSkills(root);
    rmSync(join(root, '.agents', 'skills', 'gone'), { recursive: true });
    mkdirSync(join(root, '.claude', 'skills', 'real-folder'));

    const { changes, leftAlone } = syncSkills(root);
    expect(changes).toEqual(['removed link to deleted skill gone']);
    expect(leftAlone).toEqual(['real-folder']);
    expect(lstatSync(join(root, '.claude', 'skills', 'one')).isSymbolicLink()).toBe(true);
    expect(existsSync(join(root, '.claude', 'skills', 'one', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(root, '.claude', 'skills', 'real-folder'))).toBe(true);
  });

  it('is a no-op the second time', () => {
    addSkill('one');
    syncSkills(root);
    expect(syncSkills(root)).toEqual({ changes: [], leftAlone: [] });
  });
});

describe("this project's skills", () => {
  it('are valid and visible to both Claude Code and Codex', () => {
    const { skills, problems } = checkProject(resolve(__dirname, '..'));
    expect(problems).toEqual([]);
    expect(skills.length).toBeGreaterThan(0);
  });
});
