// Works out your Supabase project's address and the key used to back up stored files,
// so learners only need three secrets. Run inside GitHub Actions:
//
//   node scripts/backup/supabase-project.mjs "$GITHUB_ENV" [backup|restore]
//
// Appends SUPABASE_URL and SUPABASE_SECRET_KEY to the given env file (hiding the key in
// every log first). The key comes from the SUPABASE_SECRET_KEY secret (or the older
// SUPABASE_SERVICE_ROLE_KEY); older setups that use SUPABASE_ACCESS_TOKEN still work.
//
// If stored files can't be backed up, it says why in STORAGE_PROBLEM: the backup still
// saves your database, then the run fails with that message (see check-complete.mjs).
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSecretKey } from '../../src/lib/supabase-settings.mjs';

/** Project ref from SUPABASE_PROJECT_REF, or from the connection string. */
export function projectRef(env = process.env) {
  if (env.SUPABASE_PROJECT_REF) return env.SUPABASE_PROJECT_REF.trim();
  const url = env.SUPABASE_DB_URL ?? '';
  // Session pooler: postgresql://postgres.<ref>:…@aws-0-….pooler.supabase.com:5432/postgres
  // Direct:         postgresql://postgres:…@db.<ref>.supabase.co:5432/postgres
  return /\/\/postgres\.([a-z0-9]{20})[:@]/.exec(url)?.[1] ?? /@db\.([a-z0-9]{20})\.supabase\.co/.exec(url)?.[1] ?? null;
}

/** Older setups: the project's secret key, via the Supabase Management API. */
export async function secretKey(ref, accessToken, fetchImpl = fetch) {
  const res = await fetchImpl(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Supabase answered ${res.status} — SUPABASE_ACCESS_TOKEN was not accepted.`);
  const keys = await res.json();
  const key = keys.find((k) => k.type === 'secret') ?? keys.find((k) => k.name === 'service_role');
  if (!key?.api_key) throw new Error('No secret key found for this project.');
  return key.api_key;
}

const ADD_KEY =
  'Add the SUPABASE_SECRET_KEY secret (Supabase → Project Settings → API Keys → Secret keys), ' +
  'or ask your agent to run "connect backups".';

/**
 * Where the stored-files key comes from. Returns { url, key, problem }: `problem` is a
 * plain-English reason stored files can't be backed up (null when all is well).
 */
export async function storageAccess(env = process.env, fetchImpl = fetch) {
  const ref = projectRef(env);
  if (!ref) {
    return {
      url: null,
      key: null,
      problem: "Couldn't work out your Supabase project from SUPABASE_DB_URL — it should be the Session pooler connection string (postgresql://postgres.<project>:…).",
    };
  }
  const url = `https://${ref}.supabase.co`;
  const given = env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (given) {
    if (!isSecretKey(given)) {
      return { url, key: null, problem: `SUPABASE_SECRET_KEY holds the publishable key, which can't read stored files. ${ADD_KEY}` };
    }
    return { url, key: given, problem: null };
  }
  if (env.SUPABASE_ACCESS_TOKEN?.trim()) {
    try {
      return { url, key: await secretKey(ref, env.SUPABASE_ACCESS_TOKEN.trim(), fetchImpl), problem: null };
    } catch (err) {
      return { url, key: null, problem: `${err.message} ${ADD_KEY}` };
    }
  }
  return { url, key: null, problem: `Stored files weren't backed up: SUPABASE_SECRET_KEY isn't set. ${ADD_KEY}` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [envFile, purpose = 'backup'] = process.argv.slice(2);
  const { url, key, problem } = await storageAccess();
  const lines = [];
  if (url) lines.push(`SUPABASE_URL=${url}`);
  if (key) {
    console.log(`::add-mask::${key}`); // hide before it can appear anywhere
    lines.push(`SUPABASE_SECRET_KEY=${key}`);
  }
  if (problem) {
    // A restore only needs the key if the backup has files; restore.sh says so if it does.
    console.log(purpose === 'restore' ? `::notice::${problem}` : `::warning::${problem}`);
    lines.push(`STORAGE_PROBLEM=${problem.replace(/\n/g, ' ')}`);
  }
  appendFileSync(envFile, lines.join('\n') + '\n');
  if (url) console.log(`Supabase project: ${url}`);
}
