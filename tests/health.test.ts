import { describe, it, expect, vi } from 'vitest';
import { checkSupabase, readSupabaseEnv, whereAmI } from '@/lib/health';

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

describe('whereAmI', () => {
  it.each([
    ['production', 'live'],
    ['preview', 'preview'],
    [undefined, 'development'],
  ])('VERCEL_ENV=%s → %s', (vercelEnv, place) => {
    expect(whereAmI({ VERCEL_ENV: vercelEnv })).toBe(place);
  });
});
