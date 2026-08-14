import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { badRequest, json, parseBody, unauthorized } from '@/lib/api/http';
import { joinHouseholdSchema } from '@/lib/validation';
import { joinHousehold } from '@/lib/mutations/household';

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
    // The RPC raises on an invalid/expired code — surface it as a 400.
    const message =
      error instanceof Error ? error.message : 'Could not join household';
    return badRequest(message);
  }
}
