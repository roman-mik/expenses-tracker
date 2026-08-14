import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { json, unauthorized } from '@/lib/api/http';
import {
  getActiveInviteCode,
  getHouseholdMembers,
} from '@/lib/queries/household';

/** The Household screen payload: members, the active invite code, and self. */
export async function GET() {
  const user = await verifySession();
  if (!user) return unauthorized();
  const householdId = await getHouseholdId(user.id);
  if (!householdId) return unauthorized();

  const supabase = await createClient();
  try {
    const [members, invite] = await Promise.all([
      getHouseholdMembers(supabase, householdId),
      getActiveInviteCode(supabase, householdId),
    ]);
    return json({ householdId, currentUserId: user.id, members, invite });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
