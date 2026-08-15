import { json, requireHousehold } from '@/lib/api/http';
import {
  getActiveInviteCode,
  getHouseholdMembers,
} from '@/lib/queries/household';

/** The Household screen payload: members, the active invite code, and self. */
export async function GET() {
  const ctx = await requireHousehold();
  if ('response' in ctx) return ctx.response;

  try {
    const [members, invite] = await Promise.all([
      getHouseholdMembers(ctx.supabase, ctx.householdId),
      getActiveInviteCode(ctx.supabase, ctx.householdId),
    ]);
    return json({
      householdId: ctx.householdId,
      currentUserId: ctx.user.id,
      members,
      invite,
    });
  } catch (error) {
    console.error('GET /api/household failed', error);
    return json({ error: 'Failed to load the household' }, { status: 500 });
  }
}
