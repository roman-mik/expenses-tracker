import { json, requireHousehold } from '@/lib/api/http';
import { createInvite } from '@/lib/mutations/household';

/** Mint a fresh invite code for the caller's household. */
export async function POST() {
  const ctx = await requireHousehold();
  if ('response' in ctx) return ctx.response;

  try {
    const code = await createInvite(ctx.supabase, ctx.householdId, ctx.user.id);
    return json({ code }, { status: 201 });
  } catch (error) {
    console.error('POST /api/household/invite failed', error);
    return json({ error: 'Failed to create an invite code' }, { status: 500 });
  }
}
