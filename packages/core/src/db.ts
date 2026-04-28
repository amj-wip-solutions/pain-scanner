import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './config.js';

let cached: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (cached) return cached;
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    throw new Error(
      'Supabase env vars missing: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    );
  }
  cached = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false },
  });
  return cached;
}
