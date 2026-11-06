import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALLOWED_DOMAINS, allowlistSteps, networkCheck, placeCheck, toolsCheck, whereAmIWorking } from '../scripts/cloud-check.mjs';

// Working in the cloud: where the agent runs, what it can reach, and how to fix it.

describe('where the agent works', () => {
  it.each([
    [{ CLAUDE_CODE_REMOTE: 'true' }, 'linux', 'claude-cloud'],
    [{ CODEX_ENV_NODE_VERSION: '22' }, 'linux', 'codex-cloud'],
    [{ CLAUDECODE: '1' }, 'darwin', 'claude-local'],
    [{ CODEX_SANDBOX: 'seatbelt' }, 'darwin', 'codex-local'],
    [{}, 'win32', 'local'],
    [{}, 'linux', 'unknown'],
  ])('%j on %s → %s', (env, platform, place) => {
    expect(whereAmIWorking(env, platform)).toBe(place);
  });

  it('local is recognised and explained, not treated as broken', () => {
    const row = placeCheck('codex-local');
    expect(row.status).toBe('ok');
    expect(row.detail).toMatch(/works, but .*one computer/);
    expect(placeCheck('claude-cloud')).toMatchObject({ status: 'ok', detail: 'Claude Code, in the cloud' });
  });
});

describe('internet access', () => {
  const answer = (blockedHosts: string[], how: 'throw' | 'proxy403' = 'throw') =>
    vi.fn(async (url: string | URL | Request) => {
      const host = new URL(String(url)).host;
      if (!blockedHosts.includes(host)) return new Response('{}', { status: 200 });
      if (how === 'proxy403') return new Response('Host not allowed by network policy', { status: 403 });
      throw new TypeError('fetch failed');
    });

  it('all reachable → OK', async () => {
    expect(await networkCheck('codex-cloud', answer([]))).toMatchObject({ status: 'ok' });
  });

  it('names each blocked service and gives the exact Codex allowlist steps', async () => {
    const row = await networkCheck('codex-cloud', answer(['api.supabase.com', 'api.vercel.com']));
    expect(row.status).toBe('warn');
    expect(row.detail).toContain('Supabase (api.supabase.com), Vercel (api.vercel.com)');
    expect(row.detail).not.toContain('GitHub');
    expect(row.fix).toMatch(/Allow Codex to access internet.*Additional allowed domains/);
    for (const d of ALLOWED_DOMAINS) expect(row.fix).toContain(d);
    expect(row.fix).toMatch(/Agent Security/);
  });

  it("treats a proxy's 403 refusal as blocked, and gives Claude Code's steps there", async () => {
    const row = await networkCheck('claude-cloud', answer(['api.github.com'], 'proxy403'));
    expect(row.detail).toContain('GitHub (api.github.com)');
    expect(row.fix).toMatch(/Network access: Custom.*Also include default list/);
  });

  it('an ordinary 403 from the service itself still counts as reachable', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"message":"Forbidden"}', { status: 403 }));
    expect((await networkCheck('codex-cloud', fetchImpl)).status).toBe('ok');
  });

  it('other agents get the plain list', () => {
    expect(allowlistSteps('other')).toContain('*.vercel.app');
  });
});

describe('command-line tools', () => {
  it('says which are missing and how to install them', () => {
    expect(toolsCheck((t: string) => t === 'gh')).toMatchObject({ status: 'warn', detail: 'supabase not installed' });
    expect(toolsCheck(() => true).status).toBe('ok');
  });

  it('setup.sh installs pinned gh and supabase, matching the workflows', () => {
    const setup = readFileSync(resolve(__dirname, '../scripts/setup.sh'), 'utf8');
    const supabasePin = /SUPABASE_VERSION=(\S+)/.exec(setup)?.[1];
    const migrate = readFileSync(resolve(__dirname, '../.github/workflows/migrate.yml'), 'utf8');
    expect(migrate).toContain(`version: ${supabasePin}`);
    expect(setup).toMatch(/GH_VERSION=\d+\.\d+\.\d+/);
    expect(setup).toMatch(/sha256sum -c/); // downloads are checked
  });
});
