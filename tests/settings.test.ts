import { describe, it, expect } from 'vitest';
import { isSecretKey, keyProblems, supabaseSettingProblems, urlProblems } from '@/lib/supabase-settings.mjs';
import { prWarning, migrateDecision, MARKER } from '../scripts/db-ready.mjs';

// The Supabase settings people most often paste by mistake get a specific fix.

const REF = 'abcdefghijklmnopqrst';
const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.signature`;

describe('project URL', () => {
  it.each([`https://${REF}.supabase.co`, `https://${REF}.supabase.co/`, 'http://127.0.0.1:54321', 'https://db.example.com'])(
    'accepts %s',
    (url) => expect(urlProblems(url)).toEqual([]),
  );

  it('spots the dashboard address and says which URL to use instead', () => {
    const [p] = urlProblems(`https://supabase.com/dashboard/project/${REF}/settings/api`);
    expect(p).toMatch(/dashboard/);
    expect(p).toContain(`https://${REF}.supabase.co`);
  });

  it('spots /rest/v1 on the end', () => {
    const [p] = urlProblems(`https://${REF}.supabase.co/rest/v1/`);
    expect(p).toMatch(/ends in \/rest\/v1\. Remove that part/);
    expect(p).toContain(`use https://${REF}.supabase.co.`);
  });

  it('spots the database connection string, and says to reset the password', () => {
    const [p] = urlProblems('postgresql://postgres.abc:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres');
    expect(p).toMatch(/connection string/);
    expect(p).toMatch(/reset that password/);
    expect(p).not.toContain(':pw@'); // never repeats the value
  });

  it('spots text that is not an address, and plain http', () => {
    expect(urlProblems('my project')[0]).toMatch(/isn't a web address/);
    expect(urlProblems(`http://${REF}.supabase.co`)[0]).toMatch(/https:\/\//);
  });
});

describe('keys in public settings', () => {
  it('recognises secret keys, new and old style', () => {
    expect(isSecretKey('sb_secret_abc')).toBe(true);
    expect(isSecretKey(jwt('service_role'))).toBe(true);
    expect(isSecretKey(jwt('anon'))).toBe(false);
    expect(isSecretKey('sb_publishable_abc')).toBe(false);
  });

  it('a secret key in NEXT_PUBLIC_ gets a specific warning and a rotate step', () => {
    const [p] = keyProblems('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_secret_abc');
    expect(p).toMatch(/holds a secret key/);
    expect(p).toMatch(/sb_publishable_/);
    expect(p).toMatch(/create a new secret key and delete the old one/);
  });

  it('an address pasted as the key', () => {
    expect(keyProblems('NEXT_PUBLIC_SUPABASE_ANON_KEY', `https://${REF}.supabase.co`)[0]).toMatch(/address, not a key/);
  });

  it('checks every setting at once; missing settings are not problems', () => {
    expect(supabaseSettingProblems({})).toEqual([]);
    expect(
      supabaseSettingProblems({
        NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.com/dashboard',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('service_role'),
      }),
    ).toHaveLength(2);
  });
});

describe('database changes before the database is connected (db-ready)', () => {
  const connected = { SUPABASE_DB_URL: 'postgresql://x', BACKUP_PASSPHRASE: 'p' };
  const kit = 'supabase/migrations/20261012000000_bumper_lanes_backup_status.sql';
  const own = 'supabase/migrations/20261101000000_notes.sql';

  it('a brand-new copy of the kit is not a red ✗ — just a note', () => {
    const d = migrateDecision({}, [kit]);
    expect(d).toMatchObject({ ready: false, level: 'notice' });
    expect(d.message).toMatch(/Run workflow/);
  });

  it("the learner's own change with secrets missing fails, and says how to fix it", () => {
    const d = migrateDecision({ SUPABASE_DB_URL: 'x' }, [kit, own]);
    expect(d).toMatchObject({ ready: false, level: 'error' });
    expect(d.message).toContain('`BACKUP_PASSPHRASE`');
    expect(d.message).toMatch(/doctor/);
  });

  it('goes ahead when both secrets are set', () => {
    expect(migrateDecision(connected, [kit, own])).toMatchObject({ ready: true, level: 'ok' });
  });

  it('warns on a pull request that adds a migration while secrets are missing', () => {
    const w = prWarning({}, ['src/app/page.tsx', own]);
    expect(w).toContain(MARKER);
    expect(w).toContain(own);
    expect(w).toMatch(/SUPABASE_DB_URL.*BACKUP_PASSPHRASE/);
  });

  it('stays quiet with the secrets set, or when no migration changed', () => {
    expect(prWarning(connected, [own])).toBeNull();
    expect(prWarning({}, ['src/app/page.tsx', 'supabase/config.toml'])).toBeNull();
  });
});
