/**
 * Data Access Layer for auth. Per Next.js 16 guidance, real authorization lives
 * close to the data (here), NOT in `proxy.ts` (which only does optimistic session
 * refresh) and NOT in layouts (which don't re-render on navigation).
 *
 * `verifySession` is wrapped in React `cache()` so repeated calls within a single
 * request/render hit Supabase only once.
 */
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

/** The authenticated identity. Only the user id is ever consumed downstream. */
export type SessionUser = { id: string };

/**
 * Returns the authenticated user, or null. Never throws.
 *
 * Uses `getClaims()` rather than `getUser()`: with asymmetric JWT signing keys
 * it verifies the token's signature *locally* (no round-trip to the Supabase
 * Auth server), which is the hot path on every authed navigation. It falls back
 * to a network `getUser()` internally only when the project still signs with the
 * legacy symmetric HS256 secret — so this is safe regardless of key type.
 */
export const verifySession = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  const id = data.claims.sub;
  return id ? { id } : null;
});

/**
 * Resolves the household a user belongs to. Every user is in exactly one
 * household (a household-of-one until they pair up), seeded by the
 * `handle_new_user` trigger. `cache()`-wrapped so repeated calls within a
 * request hit Supabase once. Returns null only in the pathological case of a
 * user with no membership row.
 */
export const getHouseholdId = cache(
  async (userId: string): Promise<string | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.household_id ?? null;
  }
);
