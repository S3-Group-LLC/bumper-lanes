// Makes every skill in .agents/skills visible to Claude Code (run: npm run sync:skills).
//
// Codex reads skills from .agents/skills. Claude Code reads .claude/skills, so
// each skill gets a link there: .claude/skills/<name> → ../../.agents/skills/<name>.
// Safe to run any time. It only adds missing links and removes links to skills
// that no longer exist — it never deletes a real folder.
import { existsSync, lstatSync, mkdirSync, readdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function syncSkills(root) {
  const agentsDir = join(root, '.agents', 'skills');
  const claudeDir = join(root, '.claude', 'skills');
  const changes = [];
  const leftAlone = [];

  if (lstatSafe(claudeDir)?.isSymbolicLink()) return { changes, leftAlone }; // whole-folder link: nothing to do
  mkdirSync(claudeDir, { recursive: true });

  const skills = existsSync(agentsDir)
    ? readdirSync(agentsDir).filter((n) => !n.startsWith('.') && lstatSafe(join(agentsDir, n))?.isDirectory())
    : [];

  for (const name of skills) {
    const target = join(claudeDir, name);
    const stat = lstatSafe(target);
    if (stat?.isSymbolicLink() && !existsSync(target)) {
      unlinkSync(target); // broken link: recreate below
    } else if (stat) {
      if (!stat.isSymbolicLink()) leftAlone.push(name);
      continue;
    }
    symlinkSync(join('..', '..', '.agents', 'skills', name), target, 'dir');
    changes.push(`linked ${name}`);
  }

  for (const name of readdirSync(claudeDir).filter((n) => !n.startsWith('.'))) {
    if (skills.includes(name)) continue;
    if (lstatSafe(join(claudeDir, name)).isSymbolicLink()) {
      unlinkSync(join(claudeDir, name));
      changes.push(`removed link to deleted skill ${name}`);
    } else {
      leftAlone.push(name);
    }
  }
  return { changes, leftAlone };
}

function lstatSafe(path) {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? join(fileURLToPath(import.meta.url), '..', '..'));
  const { changes, leftAlone } = syncSkills(root);
  for (const c of changes) console.log(`✓ ${c}`);
  for (const name of leftAlone) {
    console.log(`! .claude/skills/${name} is a real folder, not a link — left it alone. Run "npm run check:skills" for details.`);
  }
  if (!changes.length && !leftAlone.length) console.log('✓ Skills already in sync.');
}
