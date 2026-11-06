// Catches the Supabase settings people most often paste by mistake, and says exactly
// what to paste instead. Plain JavaScript so both the app (/status, src/lib/health.ts)
// and the doctor script (scripts/doctor.mjs) can use it.

const URL_NAME = 'NEXT_PUBLIC_SUPABASE_URL';
const KEY_NAMES = ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const WHERE_URL = 'Supabase → Project Settings → Data API → Project URL';
const WHERE_KEY = 'Supabase → Project Settings → API Keys → Publishable key';

/** "https://abcd.supabase.co", or a hint if we can't work out the project. */
const projectUrl = (ref) => (ref ? `https://${ref}.supabase.co` : 'https://<your-project>.supabase.co');

/**
 * Problems with the project address. Returns [] when it looks right.
 * @param {string | undefined} value
 * @returns {string[]}
 */
export function urlProblems(value) {
  const v = value?.trim();
  if (!v) return [];
  if (/^postgres(ql)?:\/\//i.test(v)) {
    return [
      `${URL_NAME} holds the database connection string (postgresql://…), not the project address. ` +
        `Paste the Project URL instead — it looks like ${projectUrl()} (${WHERE_URL}). ` +
        'The connection string contains your database password, so reset that password in Supabase → Project Settings → Database.',
    ];
  }
  let url;
  try {
    url = new URL(v);
  } catch {
    return [`${URL_NAME} isn't a web address. It should look like ${projectUrl()} (${WHERE_URL}).`];
  }
  if (/(^|\.)supabase\.com$/i.test(url.hostname)) {
    const ref = /\/project\/([a-z0-9]{20})\b/.exec(url.pathname)?.[1];
    return [
      `${URL_NAME} is the address of the Supabase dashboard, not your project. ` +
        `Use ${projectUrl(ref)} instead (${WHERE_URL}).`,
    ];
  }
  const ref = /^([a-z0-9]{20})\.supabase\.co$/i.exec(url.hostname)?.[1];
  if (/\/(rest|auth|storage|realtime|functions)\/v1/.test(url.pathname)) {
    return [`${URL_NAME} ends in ${url.pathname.replace(/\/+$/, '')}. Remove that part: use ${ref ? projectUrl(ref) : url.origin}.`];
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    return [`${URL_NAME} should be just the address, with nothing after it: use ${ref ? projectUrl(ref) : url.origin}.`];
  }
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)$/.test(url.hostname);
  if (url.protocol !== 'https:' && !local) {
    return [`${URL_NAME} should start with https:// — use ${ref ? projectUrl(ref) : `https://${url.host}`}.`];
  }
  return [];
}

/** Older Supabase keys are JWTs; the payload says which role the key has. */
function jwtRole(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json).role ?? null;
  } catch {
    return null;
  }
}

/** Does this look like a key that must never be public? */
export function isSecretKey(value) {
  const v = value?.trim() ?? '';
  return v.startsWith('sb_secret_') || jwtRole(v) === 'service_role';
}

/**
 * Problems with a browser key setting. Returns [] when it looks right.
 * @param {string} name
 * @param {string | undefined} value
 * @returns {string[]}
 */
export function keyProblems(name, value) {
  const v = value?.trim();
  if (!v) return [];
  if (isSecretKey(v)) {
    return [
      `${name} holds a secret key. Anything in a NEXT_PUBLIC_ setting can reach visitors' browsers, ` +
        `and a secret key gives full access to your data, so the app won't use it. ` +
        `Paste the publishable key instead (starts with sb_publishable_ — ${WHERE_KEY}), ` +
        'then in the same place create a new secret key and delete the old one.',
    ];
  }
  if (/^(https?|postgres(ql)?):\/\//i.test(v)) {
    return [`${name} holds an address, not a key. Paste the publishable key (starts with sb_publishable_ — ${WHERE_KEY}).`];
  }
  return [];
}

/**
 * Every problem with the app's Supabase settings. Missing settings are not problems
 * here (the app just isn't connected yet).
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function supabaseSettingProblems(env) {
  return [...urlProblems(env[URL_NAME]), ...KEY_NAMES.flatMap((name) => keyProblems(name, env[name]))];
}
