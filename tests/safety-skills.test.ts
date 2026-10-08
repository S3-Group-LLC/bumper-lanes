import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findTablesWithoutRls } from '../scripts/check-rls.mjs';

// Guard the safety skills' content, so later edits can't quietly weaken them.
const skills = resolve(__dirname, '../.agents/skills');
const read = (path: string) => readFileSync(join(skills, path), 'utf8');

/** Every SQL template the add-data skill offers: the example file + each ```sql block. */
function sqlTemplates() {
  const blocks = [...read('add-data/references/policies.md').matchAll(/```sql\n([\s\S]*?)```/g)].map((m, i) => ({
    name: `policies.md block ${i + 1}`,
    sql: m[1],
  }));
  return [{ name: 'example-migration.sql', sql: read('add-data/references/example-migration.sql') }, ...blocks].filter((t) =>
    /create table/i.test(t.sql),
  );
}

describe('add-data templates (GR-3)', () => {
  const templates = sqlTemplates();

  it('offers the example plus patterns B, C and D', () => {
    expect(templates.map((t) => t.name)).toHaveLength(4);
  });

  it.each(templates.map((t) => [t.name, t.sql]))('%s passes the RLS check', (_name, sql) => {
    expect(findTablesWithoutRls([{ file: 'x.sql', sql }])).toEqual([]);
  });

  it.each(templates.map((t) => [t.name, t.sql]))('%s fails the RLS check without its "enable row level security" line', (_name, sql) => {
    const withoutRls = sql.replace(/^alter table .* enable row level security;$/gim, '');
    expect(findTablesWithoutRls([{ file: 'x.sql', sql: withoutRls }])).toHaveLength(1);
  });

  it.each(templates.map((t) => [t.name, t.sql]))('%s grants access explicitly and uses (select auth.uid()) correctly', (_name, sql) => {
    expect(sql).toMatch(/^grant .+ on table public\.\w+ to /im);
    expect(sql).not.toMatch(/[^(]auth\.uid\(\) =|= auth\.uid\(\)[^ ]/); // policies use (select auth.uid())
  });
});

describe('no destructive action without the learner (GR-6)', () => {
  it('restore never starts the Restore workflow or types RESTORE for the learner', () => {
    const restore = read('restore/SKILL.md');
    expect(restore).not.toMatch(/gh workflow run restore/i);
    expect(restore).not.toMatch(/-f confirm=RESTORE/);
    expect(restore).toMatch(/never start the Restore workflow yourself, and you never type\s+`RESTORE`/);
  });

  it('undo asks before acting, uses pull requests, and never rewrites history', () => {
    const undo = read('undo/SKILL.md');
    expect(undo).toMatch(/ask for a\s+clear yes before doing anything/);
    expect(undo).not.toMatch(/`git (push --force|push -f|reset --hard)/);
    expect(undo).toMatch(/Never force-push,\s+never reset `main`,\s+never rewrite history/);
  });

  it('undo keeps applied database changes and hands data to restore', () => {
    const undo = read('undo/SKILL.md');
    expect(undo).toMatch(/:\(exclude\)supabase\/migrations/);
    expect(undo).toMatch(/git checkout origin\/main -- supabase\/migrations/);
    expect(undo).toMatch(/Hand off to the \*\*restore\*\* skill/);
  });

  it('undo explains Vercel Undo Rollback (new changes stop going live after a rollback)', () => {
    expect(read('undo/SKILL.md')).toMatch(/Undo Rollback/);
  });

  it('add-data never applies changes itself or edits merged migrations', () => {
    const addData = read('add-data/SKILL.md');
    expect(addData).toMatch(/never connect to\s+the\s+live\s+database\s+and\s+never\s+run\s+the\s+change\s+yourself/);
    expect(addData).toMatch(/Never edit a migration that's already been merged/);
  });
});
