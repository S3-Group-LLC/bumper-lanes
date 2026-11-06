// Where is your agent working (in the cloud or on a computer), and can it reach the
// websites it needs? Used by the doctor script (scripts/doctor.mjs).
//
// Cloud agents only reach the domains their environment allows. Everything in the kit
// works without them, but with them your agent can check your live site, Supabase and
// GitHub itself instead of asking you to.

/** Domains to allow, in the form both Codex and Claude Code accept. */
export const ALLOWED_DOMAINS = [
  'github.com',
  'api.github.com',
  '*.supabase.co',
  'api.supabase.com',
  'vercel.com',
  'api.vercel.com',
  '*.vercel.app',
];

/** What doctor actually tests (one real address per service). */
export const REACHABILITY = [
  { name: 'GitHub', url: 'https://api.github.com', domain: 'api.github.com' },
  { name: 'Supabase', url: 'https://api.supabase.com', domain: 'api.supabase.com' },
  { name: 'Vercel', url: 'https://api.vercel.com', domain: 'api.vercel.com' },
];

/**
 * claude-cloud · codex-cloud · claude-local · codex-local · local · unknown
 * Claude Code's cloud sets CLAUDE_CODE_REMOTE=true; Codex's cloud image sets CODEX_ENV_* settings.
 */
export function whereAmIWorking(env = process.env, platform = process.platform) {
  if (env.CLAUDE_CODE_REMOTE === 'true') return 'claude-cloud';
  const keys = Object.keys(env);
  if (keys.some((k) => k.startsWith('CODEX_ENV_'))) return 'codex-cloud';
  if (platform === 'darwin' || platform === 'win32') {
    if (env.CLAUDECODE === '1') return 'claude-local';
    if (keys.some((k) => k.startsWith('CODEX_'))) return 'codex-local';
    return 'local';
  }
  return 'unknown';
}

const PLACE = {
  'claude-cloud': 'Claude Code, in the cloud',
  'codex-cloud': 'Codex, in the cloud',
  'claude-local': 'Claude Code, on this computer',
  'codex-local': 'Codex, on this computer',
  local: 'on this computer',
  unknown: 'probably in the cloud',
};

/** The doctor row for where we're working. Local is fine — just explained. */
export function placeCheck(place) {
  if (place.endsWith('local')) {
    return {
      status: 'ok',
      title: 'Where your agent works',
      detail: `${PLACE[place]}. That works, but your project's setup lives on this one computer. To work from anywhere, use the cloud (see "Open your project with your agent").`,
    };
  }
  return { status: 'ok', title: 'Where your agent works', detail: PLACE[place] };
}

/** Did the request get out? A thrown error or a proxy refusal means "blocked". */
async function reachable(url, fetchImpl, timeoutMs) {
  try {
    const res = await fetchImpl(url, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) });
    if (res.status === 403) {
      const body = await res.text().catch(() => '');
      if (/not allowed|blocked|allowlist|denied by policy|proxy/i.test(body)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** How to allow domains, for this agent. */
export function allowlistSteps(place) {
  const list = ALLOWED_DOMAINS.join(', ');
  if (place === 'codex-cloud') {
    return `Codex → your environment → Edit → turn on "Allow Codex to access internet" → Allow domains: Package managers → Additional allowed domains: ${list} → Republish, then start a new task. Still blocked? Your workspace admin's Agent Security settings may block it.`;
  }
  if (place === 'claude-cloud') {
    return `claude.ai/code → the cloud icon above the message box → your environment's settings → Network access: Custom → tick "Also include default list of common package managers" → Allowed domains: ${list} → Save.`;
  }
  return `Allow these domains in your agent's environment: ${list}.`;
}

/** Tests each service; returns the doctor row (only meaningful in the cloud). */
export async function networkCheck(place, fetchImpl = fetch, timeoutMs = 4000) {
  const results = await Promise.all(REACHABILITY.map(async (r) => ({ ...r, ok: await reachable(r.url, fetchImpl, timeoutMs) })));
  const blocked = results.filter((r) => !r.ok);
  if (!blocked.length) return { status: 'ok', title: 'Internet access', detail: 'can reach GitHub, Supabase and Vercel' };
  return {
    status: 'warn',
    title: 'Internet access',
    detail: `can't reach ${blocked.map((b) => `${b.name} (${b.domain})`).join(', ')} — fine for building, but I'll ask you to check those sites yourself`,
    fix: allowlistSteps(place),
  };
}

/** Are the command-line tools setup.sh installs available? */
export function toolsCheck(has) {
  const missing = ['gh', 'supabase'].filter((t) => !has(t));
  return missing.length
    ? { status: 'warn', title: 'Command-line tools', detail: `${missing.join(' and ')} not installed`, fix: 'Run: bash scripts/setup.sh (needs internet during setup).' }
    : { status: 'ok', title: 'Command-line tools', detail: 'gh and supabase are installed' };
}
