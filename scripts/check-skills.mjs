// Checks your agent skills (run: npm run check:skills).
//
// Skills live in .agents/skills/<name>/SKILL.md (Codex reads them there).
// Each one is linked into .claude/skills/<name> (Claude Code reads them there) —
// npm run sync:skills creates the links.
// This script makes sure every skill follows the open Agent Skills format
// (https://agentskills.io/specification) and that both agents see the same skills.
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Splits SKILL.md into its YAML frontmatter and Markdown body. */
export function readFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) return { error: 'SKILL.md must start with frontmatter between two --- lines' };
  try {
    const data = parse(match[1]);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { error: 'frontmatter must be a list of "key: value" lines' };
    }
    return { data, body: text.slice(match[0].length) };
  } catch (err) {
    return { error: `frontmatter is not valid YAML: ${err.message.split('\n')[0]}` };
  }
}

/** Returns a list of problems with one skill folder (empty list = valid). */
export function validateSkill(skillDir) {
  const folder = skillDir.split(/[\\/]/).filter(Boolean).pop();
  const file = join(skillDir, 'SKILL.md');
  if (!existsSync(file)) return [`${folder}: missing SKILL.md`];

  const { data, body, error } = readFrontmatter(readFileSync(file, 'utf8'));
  if (error) return [`${folder}: ${error}`];

  const problems = [];
  const fail = (msg) => problems.push(`${folder}: ${msg}`);
  const { name, description, compatibility, metadata } = data;

  if (typeof name !== 'string' || !name) fail('frontmatter needs a "name"');
  else {
    if (name.length > 64) fail(`"name" is ${name.length} characters (max 64)`);
    if (!NAME_PATTERN.test(name)) {
      fail(`"name" must be lowercase letters, numbers and single hyphens (got "${name}")`);
    }
    if (name !== folder) fail(`"name" is "${name}" but the folder is "${folder}" — they must match`);
  }

  if (typeof description !== 'string' || !description.trim()) {
    fail('frontmatter needs a "description" saying what the skill does and when to use it');
  } else if (description.length > 1024) {
    fail(`"description" is ${description.length} characters (max 1024)`);
  }

  if (compatibility !== undefined && (typeof compatibility !== 'string' || compatibility.length > 500)) {
    fail('"compatibility" must be text of at most 500 characters');
  }
  if (
    metadata !== undefined &&
    (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata) ||
      Object.values(metadata).some((v) => typeof v !== 'string'))
  ) {
    fail('"metadata" must be a list of "key: text" pairs');
  }

  if (!body.trim()) fail('SKILL.md has no instructions after the frontmatter');

  // Relative Markdown links, e.g. [guide](references/guide.md), must point at real files.
  for (const [, target] of body.matchAll(/\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
    if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) continue; // URLs, anchors, absolute paths
    const path = decodeURI(target.split('#')[0].split('?')[0]);
    if (path && !existsSync(join(skillDir, path))) fail(`links to "${path}", which doesn't exist`);
  }

  return problems;
}

/** Every file under dir (following links), as sorted relative paths. */
function listFiles(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = join(dir, entry.name);
      return statSync(full).isDirectory() ? listFiles(full, base) : [relative(base, full)];
    })
    .sort();
}

/** Lists differences between two folders' files (paths and contents). */
function diffFolders(a, b, label) {
  const fa = listFiles(a);
  const fb = listFiles(b);
  return [
    ...fa.filter((f) => !fb.includes(f)).map((f) => `${label}: ${f} is missing from the .claude/skills copy`),
    ...fb.filter((f) => !fa.includes(f)).map((f) => `${label}: ${f} is only in the .claude/skills copy`),
    ...fa
      .filter((f) => fb.includes(f) && !readFileSync(join(a, f)).equals(readFileSync(join(b, f))))
      .map((f) => `${label}: ${f} is different in .claude/skills`),
  ];
}

const isLink = (path) => {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
};

/**
 * Do Claude Code (.claude/skills) and Codex (.agents/skills) see the same skills?
 * Expected setup: each .claude/skills/<name> is a link to ../../.agents/skills/<name>
 * (create them with: npm run sync:skills). An identical copy is tolerated.
 */
export function checkSkillsLink(agentsDir, claudeDir) {
  const fix = 'Run "npm run sync:skills" to fix.';
  if (!existsSync(agentsDir)) return ['.agents/skills folder is missing'];
  if (!existsSync(claudeDir)) return [`.claude/skills folder is missing. ${fix}`];
  // A link for the whole folder also works; nothing to compare.
  if (realpathSync(claudeDir) === realpathSync(agentsDir)) return [];

  const skills = readdirSync(agentsDir).filter((n) => !n.startsWith('.'));
  const problems = [];

  for (const name of skills) {
    const source = join(agentsDir, name);
    const target = join(claudeDir, name);
    if (!existsSync(target)) {
      problems.push(
        isLink(target)
          ? `${name}: .claude/skills/${name} is a broken link. ${fix}`
          : `${name}: Claude Code can't see this skill — .claude/skills/${name} is missing. ${fix}`,
      );
    } else if (isLink(target)) {
      if (realpathSync(target) !== realpathSync(source)) {
        problems.push(`${name}: .claude/skills/${name} links to the wrong place. ${fix}`);
      }
    } else if (statSync(target).isDirectory()) {
      problems.push(...diffFolders(source, target, name));
    } else {
      problems.push(`${name}: .claude/skills/${name} should be a link to .agents/skills/${name}. ${fix}`);
    }
  }

  for (const name of readdirSync(claudeDir).filter((n) => !n.startsWith('.'))) {
    if (skills.includes(name)) continue;
    problems.push(
      isLink(join(claudeDir, name))
        ? `${name}: .claude/skills/${name} is left over from a skill that no longer exists. ${fix}`
        : `${name}: this skill is only in .claude/skills, so Codex can't see it — move it to .agents/skills/${name}.`,
    );
  }
  return problems;
}

/** Checks a whole project. Returns { skills, problems }. */
export function checkProject(root) {
  const agentsDir = join(root, '.agents', 'skills');
  const claudeDir = join(root, '.claude', 'skills');
  if (!existsSync(agentsDir)) return { skills: [], problems: ['.agents/skills folder is missing'] };

  const skills = readdirSync(agentsDir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();

  const problems = skills.flatMap((name) =>
    statSync(join(agentsDir, name)).isDirectory()
      ? validateSkill(join(agentsDir, name))
      : [`${name}: skills must be folders containing a SKILL.md, not loose files`],
  );
  problems.push(...checkSkillsLink(agentsDir, claudeDir));
  return { skills, problems };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? join(fileURLToPath(import.meta.url), '..', '..'));
  const { skills, problems } = checkProject(root);
  if (problems.length) {
    console.error(`✗ Skill check found ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`✓ ${skills.length} skill(s) OK, and Claude Code and Codex see the same ones: ${skills.join(', ')}`);
}
