// Creates a new skill from the template (used by the new-skill skill).
//
//   node scripts/new-skill.mjs <name> "<description>"     (or: npm run new-skill -- …)
//
// Writes .agents/skills/<name>/SKILL.md and TESTING.md, links it for Claude Code
// (.claude/skills/<name>), and checks it. Never overwrites an existing skill.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { validateSkill } from './check-skills.mjs';
import { syncSkills } from './sync-skills.mjs';

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Problems with a proposed name/description (empty list = fine). */
export function proposalProblems(name, description) {
  const problems = [];
  if (!name || !NAME.test(name) || name.length > 64) {
    problems.push('the name must be lowercase words joined by single hyphens, up to 64 characters (e.g. weekly-newsletter)');
  }
  if (!description || !description.trim()) problems.push('a description is needed');
  else {
    if (description.length > 1024) problems.push(`the description is ${description.length} characters (max 1024)`);
    if (!/\b(use when|use it when|use this when|when the learner|when someone)\b/i.test(description)) {
      problems.push('the description should say WHEN to use the skill — add something like "Use when the learner asks to …"');
    }
  }
  return problems;
}

const titleCase = (name) => name.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/** Renders a template, writing the description as safe YAML (quotes, colons, etc.). */
export function render(template, { name, description }) {
  const yamlDescription = stringify({ description }).trim().replace(/^description:\s*/, '');
  return template.replaceAll('{{name}}', name).replaceAll('{{title}}', titleCase(name)).replaceAll('{{description}}', yamlDescription);
}

export function createSkill(root, name, description) {
  const problems = proposalProblems(name, description);
  if (problems.length) throw new Error(problems.join('; '));
  const dir = join(root, '.agents', 'skills', name);
  if (existsSync(dir)) throw new Error(`a skill called "${name}" already exists — pick another name, or edit that one`);

  const assets = join(root, '.agents', 'skills', 'new-skill', 'assets');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), render(readFileSync(join(assets, 'SKILL.template.md'), 'utf8'), { name, description }));
  writeFileSync(join(dir, 'TESTING.md'), render(readFileSync(join(assets, 'TESTING.template.md'), 'utf8'), { name, description }));
  syncSkills(root);
  const invalid = validateSkill(dir);
  if (invalid.length) throw new Error(`the new skill didn't pass the check: ${invalid.join('; ')}`);
  return dir;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [name, description] = process.argv.slice(2);
  const root = resolve(join(fileURLToPath(import.meta.url), '..', '..'));
  try {
    const dir = createSkill(root, name, description);
    console.log(`✓ Created ${dir.slice(root.length + 1)}/SKILL.md and TESTING.md, linked for Claude Code.`);
    console.log('  Next: fill in the steps in SKILL.md and the prompts in TESTING.md, then run npm run check:skills.');
  } catch (err) {
    console.error(`✗ Couldn't create the skill: ${err.message}`);
    process.exit(1);
  }
}
