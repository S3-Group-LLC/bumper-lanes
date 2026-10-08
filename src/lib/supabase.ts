import { createClient } from '@supabase/supabase-js';
import { readSupabaseEnv } from './health';

/**
 * Talk to your Supabase database from your app. Returns null until Supabase is
 * connected, so pages can show a friendly message instead of crashing.
 *
 * Uses the publishable key, which is safe in the browser. Your data is
 * protected by Row Level Security rules on each table (see the add-data skill).
 */
export function getSupabase() {
  const { url, key } = readSupabaseEnv();
  return url && key ? createClient(url, key) : null;
}
