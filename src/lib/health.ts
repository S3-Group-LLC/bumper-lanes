// Health checks shown on the /status page. Kept free of Next.js imports so
// they can be tested on their own (see tests/health.test.ts).
import { isSecretKey, supabaseSettingProblems } from './supabase-settings.mjs';

type Env = Record<string, string | undefined>;

export type SupabaseHealth =
  | { state: 'not-connected'; missing: string[] }
  | { state: 'misconfigured'; problems: string[] }
  | { state: 'connected' }
  | { state: 'unreachable'; reason: string };

/**
 * Reads the Supabase settings. Accepts the newer "publishable" key or the older "anon" key.
 * A secret key pasted into a public setting is never used.
 */
export function readSupabaseEnv(env: Env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '') || undefined;
  const found =
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    undefined;
  const key = found && !isSecretKey(found) ? found : undefined;

  const missing: string[] = [];
  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!key) missing.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  return { url, key, missing };
}

/**
 * Is the database reachable? Asks Supabase's health endpoint, which needs no
 * tables, so it works on a brand-new project.
 */
export async function checkSupabase(
  env: Env = process.env,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 3000,
): Promise<SupabaseHealth> {
  const problems = supabaseSettingProblems(env);
  if (problems.length) return { state: 'misconfigured', problems };
  const { url, key, missing } = readSupabaseEnv(env);
  if (!url || !key) return { state: 'not-connected', missing };

  try {
    const res = await fetchImpl(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return { state: 'connected' };
    if (res.status === 401 || res.status === 403) {
      return { state: 'unreachable', reason: 'Supabase answered, but did not accept the key. Check NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.' };
    }
    return { state: 'unreachable', reason: `Supabase answered with an error (HTTP ${res.status}).` };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    return {
      state: 'unreachable',
      reason: timedOut
        ? `Supabase did not answer within ${timeoutMs / 1000} seconds. Free projects pause after a week without use — open Supabase to wake it up.`
        : 'Could not reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL.',
    };
  }
}

export type BackupHealth =
  | { state: 'not-set-up' }
  | { state: 'none' }
  | { state: 'recorded'; at: Date; covers: string[]; problems: string[] }
  | { state: 'unknown'; reason: string };

/** A backup older than this is reported as late (backups run every night). */
export const BACKUP_MAX_AGE_HOURS = 48;

type BackupRow = { created_at: string; database: boolean; files: boolean; code: boolean };

/**
 * When did the last backup run, and what did it cover? Each backup records itself in
 * the database (scripts/backup/record-backup.mjs); this asks for the latest through the
 * bumper_lanes_backup_status() function, which shares nothing else. Call it only once
 * checkSupabase says "connected".
 */
export async function checkBackups(
  env: Env = process.env,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
  timeoutMs = 3000,
): Promise<BackupHealth> {
  const { url, key } = readSupabaseEnv(env);
  if (!url || !key) return { state: 'unknown', reason: 'Connect the database first.' };
  try {
    const res = await fetchImpl(`${url}/rest/v1/rpc/bumper_lanes_backup_status`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: '{}',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    // 404: the function doesn't exist yet — the kit's database setup hasn't been applied.
    if (res.status === 404) return { state: 'not-set-up' };
    if (!res.ok) return { state: 'unknown', reason: `Supabase answered with an error (HTTP ${res.status}).` };
    const rows = (await res.json()) as BackupRow[];
    const last = Array.isArray(rows) ? rows[0] : undefined;
    if (!last) return { state: 'none' };

    const at = new Date(last.created_at);
    const covers = [last.database && 'database', last.files && 'stored files', last.code && 'code'].filter(
      (c): c is string => Boolean(c),
    );
    const problems: string[] = [];
    const hours = (now.getTime() - at.getTime()) / 3_600_000;
    if (hours > BACKUP_MAX_AGE_HOURS) {
      problems.push(
        `It's ${Math.floor(hours / 24)} days old — backups should run every night. Check GitHub → Actions → Backup, or ask your agent to run doctor.`,
      );
    }
    if (!last.database) problems.push('The database was not included.');
    if (!last.files) {
      problems.push("Stored files weren't included (the backup couldn't reach Supabase Storage). Ask your agent to run doctor.");
    }
    return { state: 'recorded', at, covers, problems };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    return { state: 'unknown', reason: timedOut ? 'Supabase did not answer in time.' : 'Could not ask Supabase.' };
  }
}

/** "12 Oct 2026, 07:31 UTC (5 hours ago)" */
export function describeTime(at: Date, now: Date = new Date()) {
  const when = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(at);
  const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  const ago =
    minutes < 2 ? 'just now'
    : minutes < 120 ? `${minutes} minutes ago`
    : minutes < 48 * 60 ? `${Math.round(minutes / 60)} hours ago`
    : `${Math.floor(minutes / 1440)} days ago`;
  return `${when} UTC (${ago})`;
}

export type Place = 'live' | 'preview' | 'development';

/** Where is this copy of the app running? Vercel sets VERCEL_ENV. */
export function whereAmI(env: Env = process.env): Place {
  if (env.VERCEL_ENV === 'production') return 'live';
  if (env.VERCEL_ENV === 'preview') return 'preview';
  return 'development';
}
