import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { capUpdateSchema } from '@/lib/validation';
import { json, parseBody, unauthorized } from '@/lib/api/http';
import { getCap } from '@/lib/queries/cap';
import { upsertCap } from '@/lib/mutations/cap';

export async function GET() {
  const user = await verifySession();
  if (!user) return unauthorized();

  const supabase = await createClient();
  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const cap = await getCap(supabase, householdId);
    if (!cap) return json(null, { status: 204 });
    return json(cap);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: `Failed to get a monthly cap ${message}` }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await verifySession();
  if (!user) return unauthorized();

  const parsed = await parseBody(request, capUpdateSchema);
  if ('response' in parsed) return parsed.response;

  const supabase = await createClient();
  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const cap = await upsertCap(supabase, householdId, parsed.data);
    return json(cap);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
