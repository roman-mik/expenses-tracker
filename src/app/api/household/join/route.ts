import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { badRequest, json, parseBody, unauthorized } from '@/lib/api/http';
import { joinHouseholdSchema } from '@/lib/validation';
import { joinHousehold } from '@/lib/mutations/household';

/**
 * The `join_household` RPC's own `raise exception` messages — everything else
 * (a genuine DB/network failure) should surface as a 500, not be swallowed
 * into a 400 as "your code was wrong".
 */
const KNOWN_JOIN_ERRORS = [
  'Not authenticated',
  'Invalid or expired invite code',
];

/** Redeem an invite code — the caller's data merges into that household. */
export async function POST(request: Request) {
  const user = await verifySession();
  if (!user) return unauthorized();

  const parsed = await parseBody(request, joinHouseholdSchema);
  if ('response' in parsed) return parsed.response;

  const supabase = await createClient();
  try {
    const householdId = await joinHousehold(supabase, parsed.data.code);
    return json({ householdId });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (KNOWN_JOIN_ERRORS.includes(message)) return badRequest(message);
    console.error('POST /api/household/join failed', error);
    return json({ error: 'Could not join that household' }, { status: 500 });
  }
}
