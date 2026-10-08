// Backs up and restores your Supabase Storage files (the database dump doesn't include them).
//
//   node scripts/backup/storage.mjs download <dir>   — copy every bucket and file into <dir>
//   node scripts/backup/storage.mjs upload <dir>     — put them back (overwrites same-named files)
//
// Needs SUPABASE_URL and SUPABASE_SECRET_KEY (the backup workflow looks these up for you).
// Restoring never deletes files; files added after the backup are left in place.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const PAGE = 1000;

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are needed for storage backups.');
  return createClient(url, key, { auth: { persistSession: false } });
}

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

/** Every file path in a bucket (folders are walked recursively). */
async function listAll(storage, bucket, prefix = '') {
  const paths = [];
  for (let offset = 0; ; offset += PAGE) {
    const items = must(await storage.from(bucket).list(prefix, { limit: PAGE, offset }), `listing ${bucket}/${prefix}`);
    for (const item of items) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) paths.push(...(await listAll(storage, bucket, path)));
      else paths.push({ path, mimetype: item.metadata?.mimetype });
    }
    if (items.length < PAGE) return paths;
  }
}

export async function download(dir, supabase = client()) {
  const buckets = must(await supabase.storage.listBuckets(), 'listing buckets');
  const manifest = [];
  for (const bucket of buckets) {
    const files = await listAll(supabase.storage, bucket.name);
    for (const { path, mimetype } of files) {
      const blob = must(await supabase.storage.from(bucket.name).download(path), `downloading ${bucket.name}/${path}`);
      const target = join(dir, 'files', bucket.name, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, Buffer.from(await blob.arrayBuffer()));
      manifest.push({ bucket: bucket.name, path, mimetype });
    }
    console.log(`  bucket "${bucket.name}": ${files.length} file(s)`);
  }
  const config = buckets.map((b) => ({
    name: b.name,
    public: b.public,
    file_size_limit: b.file_size_limit ?? null,
    allowed_mime_types: b.allowed_mime_types ?? null,
  }));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'buckets.json'), JSON.stringify(config, null, 2));
  writeFileSync(join(dir, 'files.json'), JSON.stringify(manifest, null, 2));
  return { buckets: config.length, files: manifest.length };
}

export async function upload(dir, supabase = client()) {
  const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const buckets = read('buckets.json');
  const files = read('files.json');
  const existing = new Set(must(await supabase.storage.listBuckets(), 'listing buckets').map((b) => b.name));

  for (const b of buckets) {
    const options = {
      public: b.public,
      fileSizeLimit: b.file_size_limit ?? undefined,
      allowedMimeTypes: b.allowed_mime_types ?? undefined,
    };
    if (existing.has(b.name)) must(await supabase.storage.updateBucket(b.name, options), `updating bucket ${b.name}`);
    else must(await supabase.storage.createBucket(b.name, options), `creating bucket ${b.name}`);
  }
  for (const { bucket, path, mimetype } of files) {
    const body = readFileSync(join(dir, 'files', bucket, path));
    must(
      await supabase.storage.from(bucket).upload(path, body, { upsert: true, contentType: mimetype }),
      `uploading ${bucket}/${path}`,
    );
  }
  return { buckets: buckets.length, files: files.length };
}

/** Lists files saved in a storage backup folder (used by tests and summaries). */
export function countFiles(dir) {
  const walk = (d) =>
    readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [relative(dir, join(d, n))]));
  try {
    return walk(join(dir, 'files')).length;
  } catch {
    return 0;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, dir] = process.argv.slice(2);
  const run = { download, upload }[command];
  if (!run || !dir) {
    console.error('Usage: node scripts/backup/storage.mjs <download|upload> <dir>');
    process.exit(2);
  }
  run(dir)
    .then(({ buckets, files }) => console.log(`Storage ${command}: ${buckets} bucket(s), ${files} file(s).`))
    .catch((err) => {
      console.error(`Storage ${command} failed: ${err.message}`);
      process.exit(1);
    });
}
