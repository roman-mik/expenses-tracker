/**
 * Shared handle for the Supabase client that `lib/queries/**` and
 * `lib/mutations/**` take as their first argument. Typed as the generic
 * `SupabaseClient<Database>` (not `Awaited<ReturnType<typeof createClient>>`)
 * so a native `supabase-js` client satisfies it identically to the
 * cookie-backed server client — the seam a future non-Next consumer of these
 * functions would use, without needing a workspace package (see
 * docs/review/review-api-contract.md's "delete the REST layer" plan, step 3).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type SupabaseServerClient = SupabaseClient<Database>;
