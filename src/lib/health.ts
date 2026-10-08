// Health checks shown on the /status page. Kept free of Next.js imports so
// they can be tested on their own (see tests/health.test.ts).

type Env = Record<string, string | undefined>;

export type SupabaseHealth =
  | { state: 'not-connected'; missing: string[] }
  | { state: 'connected' }
  | { state: 'unreachable'; reason: string };

/** Reads the Supabase settings. Accepts the newer "publishable" key or the older "anon" key. */
export function readSupabaseEnv(env: Env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '') || undefined;
  const key =
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    undefined;

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

export type Place = 'live' | 'preview' | 'development';

/** Where is this copy of the app running? Vercel sets VERCEL_ENV. */
export function whereAmI(env: Env = process.env): Place {
  if (env.VERCEL_ENV === 'production') return 'live';
  if (env.VERCEL_ENV === 'preview') return 'preview';
  return 'development';
}
