import { describe, it, expect, vi } from 'vitest';
import { checkBackups, checkSupabase, describeTime, readSupabaseEnv, whereAmI } from '@/lib/health';

const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co/',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};

const respond = (status: number) => vi.fn(async () => new Response('{}', { status }));

describe('readSupabaseEnv', () => {
  it('lists every missing setting', () => {
    expect(readSupabaseEnv({}).missing).toEqual([
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    ]);
  });

  it('accepts the older anon key name', () => {
    const result = readSupabaseEnv({
      NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    });
    expect(result.key).toBe('anon');
    expect(result.missing).toEqual([]);
  });

  it('never hands out a secret key pasted into a public setting', () => {
    expect(readSupabaseEnv({ ...env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_oops' }).key).toBeUndefined();
  });

  it('treats blank values as missing', () => {
    expect(readSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: '  ' }).missing).toContain('NEXT_PUBLIC_SUPABASE_URL');
  });
});

describe('checkSupabase', () => {
  it('is "not-connected" without settings, and does not call the network', async () => {
    const fetchMock = respond(200);
    const result = await checkSupabase({}, fetchMock);
    expect(result.state).toBe('not-connected');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is "misconfigured" with a specific fix for a dashboard URL — and does not call the network', async () => {
    const fetchMock = respond(200);
    const result = await checkSupabase(
      { ...env, NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.com/dashboard/project/abcdefghijklmnopqrst' },
      fetchMock,
    );
    expect(result.state).toBe('misconfigured');
    expect(result.state === 'misconfigured' && result.problems[0]).toContain('https://abcdefghijklmnopqrst.supabase.co');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is "connected" when the health endpoint answers OK', async () => {
    const fetchMock = respond(200);
    expect(await checkSupabase(env, fetchMock)).toEqual({ state: 'connected' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.supabase.co/auth/v1/health');
    expect(init.headers).toEqual({ apikey: 'sb_publishable_test' });
  });

  it('explains a rejected key', async () => {
    const result = await checkSupabase(env, respond(401));
    expect(result).toMatchObject({ state: 'unreachable' });
    expect(result.state === 'unreachable' && result.reason).toMatch(/key/);
  });

  it('reports other HTTP errors', async () => {
    const result = await checkSupabase(env, respond(503));
    expect(result.state === 'unreachable' && result.reason).toMatch(/503/);
  });

  it('is "unreachable" when the network fails', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const result = await checkSupabase(env, fetchMock);
    expect(result.state === 'unreachable' && result.reason).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it('gives up after the timeout and mentions paused projects', async () => {
    const hang = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        }),
    );
    const result = await checkSupabase(env, hang as typeof fetch, 50);
    expect(result.state === 'unreachable' && result.reason).toMatch(/pause/);
  });
});

describe('checkBackups', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  const rows = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
  const last = { created_at: '2026-10-12T07:31:00Z', database: true, files: true, code: true };

  it('asks the status function with the publishable key only', async () => {
    const fetchMock = rows([last]);
    await checkBackups(env, fetchMock, now);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.supabase.co/rest/v1/rpc/bumper_lanes_backup_status');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ apikey: 'sb_publishable_test' });
  });

  it('shows the latest backup and what it covered', async () => {
    const result = await checkBackups(env, rows([last]), now);
    expect(result).toMatchObject({ state: 'recorded', covers: ['database', 'stored files', 'code'], problems: [] });
  });

  it('warns when the last backup is more than 2 days old', async () => {
    const result = await checkBackups(env, rows([{ ...last, created_at: '2026-10-09T07:00:00Z' }]), now);
    expect(result.state === 'recorded' && result.problems[0]).toMatch(/3 days old/);
  });

  it('warns when stored files were left out', async () => {
    const result = await checkBackups(env, rows([{ ...last, files: false }]), now);
    expect(result.state === 'recorded' && result.covers).toEqual(['database', 'code']);
    expect(result.state === 'recorded' && result.problems[0]).toMatch(/Stored files/);
  });

  it('no rows → "none"; no function yet → "not-set-up"; other errors → "unknown"', async () => {
    expect(await checkBackups(env, rows([]), now)).toEqual({ state: 'none' });
    expect(await checkBackups(env, rows({ code: 'PGRST202' }, 404), now)).toEqual({ state: 'not-set-up' });
    expect(await checkBackups(env, rows({}, 500), now)).toMatchObject({ state: 'unknown' });
  });

  it('describes the time in UTC and how long ago', () => {
    expect(describeTime(new Date(last.created_at), now)).toBe('12 Oct 2026, 07:31 UTC (4 hours ago)');
    expect(describeTime(new Date('2026-10-12T11:59:30Z'), now)).toMatch(/just now/);
  });
});

describe('whereAmI', () => {
  it.each([
    ['production', 'live'],
    ['preview', 'preview'],
    [undefined, 'development'],
  ])('VERCEL_ENV=%s → %s', (vercelEnv, place) => {
    expect(whereAmI({ VERCEL_ENV: vercelEnv })).toBe(place);
  });
});
