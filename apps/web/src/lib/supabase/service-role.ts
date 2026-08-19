/**
 * A service-role Supabase client for server-only code that must bypass RLS —
 * currently just the FX cron writing `horizon_fx_rates`, which `authenticated`
 * has no write grant on at all (see 0015_ledger_fx_rates.sql). Same
 * construction as `src/test/setup-integration.ts`'s admin client, promoted
 * here since the app now needs it too, not just tests.
 *
 * Never import this from anything reachable by a request carrying a user's
 * session — it bypasses every RLS policy in the database.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import type { SupabaseServerClient } from './types';

export function createServiceRoleClient(): SupabaseServerClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set.');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.');

  return createClient<Database>(url, key, {
    auth: { persistSession: false },
  });
}
