/**
 * Shared handle for the server-side Supabase client, so query/mutation helpers
 * can be typed without re-deriving the generic each time.
 */
import type { createClient } from './server';

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
