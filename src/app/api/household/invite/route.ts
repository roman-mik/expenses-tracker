import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { json, unauthorized } from '@/lib/api/http';
import { createInvite } from '@/lib/mutations/household';

/** Mint a fresh invite code for the caller's household. */
export async function POST() {
  const user = await verifySession();
  if (!user) return unauthorized();
  const householdId = await getHouseholdId(user.id);
  if (!householdId) return unauthorized();

  const supabase = await createClient();
  try {
    const code = await createInvite(supabase, householdId, user.id);
    return json({ code }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
