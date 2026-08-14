/**
 * Data Access Layer for auth. Per Next.js 16 guidance, real authorization lives
 * close to the data (here), NOT in `proxy.ts` (which only does optimistic session
 * refresh) and NOT in layouts (which don't re-render on navigation).
 *
 * `verifySession` is wrapped in React `cache()` so repeated calls within a single
 * request/render hit Supabase only once.
 */
import { cache } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/** Returns the authenticated user, or null. Never throws. */
export const verifySession = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
});

/** Alias for readability at call sites that just want the user. */
export const getUser = verifySession;

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
