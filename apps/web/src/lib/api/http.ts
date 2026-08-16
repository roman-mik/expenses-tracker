/**
 * Small helpers shared by the few remaining route handlers (`/api/keepalive`,
 * `/api/export`) that still need raw HTTP semantics — everything else moved
 * to Server Actions when the REST layer was deleted (see
 * docs/review/review-api-contract.md). Auth is enforced per-route via the DAL
 * (`verifySession`), with Postgres RLS as the backstop.
 */
import { NextResponse } from 'next/server';
import {
  getHouseholdId,
  verifySession,
  type SessionUser,
} from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseServerClient } from '@/lib/supabase/types';

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * Resolves the caller's session and household in one place, so every route
 * agrees on what "not signed in" / "no household" looks like: both are a 401,
 * matching the fact that a caller without a household can't use any of these
 * endpoints regardless of why. A DB error resolving the household is a 500
 * with a generic message — the raw Postgres error never reaches the client.
 *
 * Every route that scopes its work by household should call this instead of
 * `verifySession` + `getHouseholdId` directly.
 */
export async function requireHousehold(): Promise<
  | { response: NextResponse }
  | { user: SessionUser; householdId: string; supabase: SupabaseServerClient }
> {
  const user = await verifySession();
  if (!user) return { response: unauthorized() };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) return { response: unauthorized() };
    const supabase = await createClient();
    return { user, householdId, supabase };
  } catch (error) {
    console.error('requireHousehold: failed to resolve household', error);
    return {
      response: json(
        { error: 'Something went wrong. Try again.' },
        { status: 500 }
      ),
    };
  }
}
