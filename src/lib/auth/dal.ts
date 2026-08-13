/**
 * Data Access Layer for auth. Per Next.js 16 guidance, real authorization lives
 * close to the data (here), NOT in `proxy.ts` (which only does optimistic session
 * refresh) and NOT in layouts (which don't re-render on navigation).
 *
 * `verifySession` is wrapped in React `cache()` so repeated calls within a single
 * request/render hit Supabase only once.
 */
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

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
