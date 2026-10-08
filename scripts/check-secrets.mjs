// Secret check (run: npm run check:secrets). Guard rail GR-4.
//
// Looks through your project's files for passwords and keys that should never be in
// code: anything pushed to GitHub must be treated as leaked. Checks files git would
// commit (including new, not-yet-committed ones), not node_modules or build output.
//
// A line that intentionally contains a fake key (e.g. in a test) can be marked with
// the comment  bumper-lanes:allow-secret  on the same line.
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOW = 'bumper-lanes:allow-secret';

/** What each kind of secret is, and where to replace ("rotate") it. */
export const RULES = [
  { name: 'Supabase secret key', re: /\bsb_secret_[A-Za-z0-9_-]{20,}/, where: 'Supabase → Project Settings → API Keys' },
  { name: 'Supabase access token', re: /\bsbp_[a-f0-9]{40}\b/, where: 'Supabase → Account → Access Tokens' },
  { name: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/, where: 'console.anthropic.com → API Keys' },
  { name: 'OpenAI API key', re: /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/, where: 'platform.openai.com → API keys' },
  { name: 'Resend API key', re: /\bre_[A-Za-z0-9]{6,}_[A-Za-z0-9]{16,}\b/, where: 'resend.com → API Keys' },
  { name: 'GitHub token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,})\b/, where: 'GitHub → Settings → Developer settings → Tokens' },
  { name: 'Stripe live key', re: /\b[sr]k_live_[A-Za-z0-9]{20,}/, where: 'Stripe → Developers → API keys' },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/, where: 'AWS → IAM → Security credentials' },
  { name: 'Private key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/, where: 'wherever the key was created' },
];

/** Connection strings with a real-looking password (placeholders and local dev are fine). */
function databaseUrlWithPassword(line) {
  for (const m of line.matchAll(/postgres(?:ql)?:\/\/([^:\s/@]+):([^@\s]+)@([^/:\s?]+)/g)) {
    const [, , password, host] = m;
    const placeholder = /[[\]<>{}$*…]|^(?:password|postgres|your-password|pw|pass|secret|x+)$/i.test(password);
    const local = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|host|db|example\.com)$/i.test(host);
    if (!placeholder && !local) return true;
  }
  return false;
}

/** Supabase's older keys are JWTs; the payload says whether it's the powerful service_role. */
function jwtKind(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload.role === 'service_role' ? 'Supabase service-role key (JWT)' : 'JWT token';
  } catch {
    return 'JWT token';
  }
}

/** Finds secrets in one file's text. Returns [{ line, kind, where }]. */
export function scanText(text) {
  const findings = [];
  text.split('\n').forEach((line, i) => {
    if (line.includes(ALLOW)) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) findings.push({ line: i + 1, kind: rule.name, where: rule.where });
    }
    for (const m of line.matchAll(/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g)) {
      findings.push({ line: i + 1, kind: jwtKind(m[0]), where: 'Supabase → Project Settings → API Keys' });
    }
    if (databaseUrlWithPassword(line)) {
      findings.push({ line: i + 1, kind: 'Database connection string with password', where: 'Supabase → Project Settings → Database → Reset password' });
    }
  });
  return findings;
}

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'out', 'build', 'coverage', '.vercel']);

/** Files git would commit; falls back to walking the folder outside a git repo. */
function projectFiles(root) {
  try {
    const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\0').filter(Boolean);
  } catch {
    const walk = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        SKIP_DIRS.has(e.name) ? [] : e.isDirectory() ? walk(join(dir, e.name)) : [relative(root, join(dir, e.name))],
      );
    return walk(root);
  }
}

export function checkProject(root) {
  const problems = [];
  const files = projectFiles(root);

  for (const file of files) {
    const base = file.split('/').pop();
    if (/^\.env(\..+)?$/.test(base) && base !== '.env.example') {
      problems.push({ file, line: 0, kind: `"${base}" file would be committed`, where: 'keep real values in Vercel / GitHub settings' });
      continue;
    }
    const full = join(root, file);
    const stat = existsSync(full) ? lstatSync(full) : null;
    // Skip links (e.g. .claude/skills/*), folders, huge files and the lockfile's hashes.
    if (!stat?.isFile() || stat.size > 1_000_000 || base === 'package-lock.json') continue;
    const text = readFileSync(full, 'utf8');
    if (text.includes('\0')) continue; // binary
    for (const f of scanText(text)) problems.push({ file, ...f });
  }

  const gitignore = existsSync(join(root, '.gitignore')) ? readFileSync(join(root, '.gitignore'), 'utf8') : '';
  if (!/^\s*\/?\.env(\*|\b)/m.test(gitignore)) {
    problems.push({ file: '.gitignore', line: 0, kind: '.env files are not ignored', where: 'add the line  .env*  to .gitignore' });
  }
  return { files: files.length, problems };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? join(fileURLToPath(import.meta.url), '..', '..'));
  const { files, problems } = checkProject(root);
  if (problems.length) {
    console.error(`✗ Found ${problems.length} possible secret(s). Never put keys or passwords in your project:`);
    for (const p of problems) {
      console.error(`  - ${p.file}${p.line ? `:${p.line}` : ''} — ${p.kind}`);
    }
    console.error('\nWhat to do:');
    console.error('  1. Remove it from the file and keep the value in Vercel (app) or GitHub secrets (automations).');
    console.error('  2. If it was ever pushed to GitHub, treat it as leaked: replace ("rotate") it where it was created:');
    for (const where of new Set(problems.map((p) => p.where))) console.error(`       • ${where}`);
    process.exit(1);
  }
  console.log(`✓ No secrets found (${files} file(s) checked).`);
}
