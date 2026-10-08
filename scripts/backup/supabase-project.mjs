// Works out your Supabase project's address and looks up its secret key, so learners
// only need to store a few secrets. Run inside GitHub Actions:
//
//   node scripts/backup/supabase-project.mjs "$GITHUB_ENV"
//
// Appends SUPABASE_URL (and SUPABASE_SECRET_KEY, if SUPABASE_ACCESS_TOKEN is set) to the
// given env file, and tells GitHub to hide the key in every log first.
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Project ref from SUPABASE_PROJECT_REF, or from the connection string. */
export function projectRef(env = process.env) {
  if (env.SUPABASE_PROJECT_REF) return env.SUPABASE_PROJECT_REF.trim();
  const url = env.SUPABASE_DB_URL ?? '';
  // Session pooler: postgresql://postgres.<ref>:…@aws-0-….pooler.supabase.com:5432/postgres
  // Direct:         postgresql://postgres:…@db.<ref>.supabase.co:5432/postgres
  return /\/\/postgres\.([a-z0-9]{20})[:@]/.exec(url)?.[1] ?? /@db\.([a-z0-9]{20})\.supabase\.co/.exec(url)?.[1] ?? null;
}

/** The project's secret (server-side) key, via the Supabase Management API. */
export async function secretKey(ref, accessToken, fetchImpl = fetch) {
  const res = await fetchImpl(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Supabase API answered ${res.status} — check SUPABASE_ACCESS_TOKEN.`);
  const keys = await res.json();
  const key = keys.find((k) => k.type === 'secret') ?? keys.find((k) => k.name === 'service_role');
  if (!key?.api_key) throw new Error('No secret key found for this project.');
  return key.api_key;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const envFile = process.argv[2];
  const ref = projectRef();
  if (!ref) {
    console.log("::warning::Couldn't work out your Supabase project. Set the SUPABASE_PROJECT_REF secret.");
    process.exit(0);
  }
  const lines = [`SUPABASE_URL=https://${ref}.supabase.co`];
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    try {
      const key = await secretKey(ref, process.env.SUPABASE_ACCESS_TOKEN);
      console.log(`::add-mask::${key}`); // hide before it can appear anywhere
      lines.push(`SUPABASE_SECRET_KEY=${key}`);
    } catch (err) {
      console.log(`::warning::Stored files won't be included: ${err.message}`);
    }
  } else {
    console.log('::notice::Stored files are skipped until the SUPABASE_ACCESS_TOKEN secret is set.');
  }
  appendFileSync(envFile, lines.join('\n') + '\n');
  console.log(`Supabase project: ${ref}`);
}
