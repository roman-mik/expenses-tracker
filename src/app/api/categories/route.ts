import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { categoryCreateSchema } from '@/lib/validation';
import { json, parseBody, unauthorized } from '@/lib/api/http';
import { getCategories } from '@/lib/queries/categories';
import { createCategory } from '@/lib/mutations/categories';

export async function GET() {
  const user = await verifySession();
  if (!user) return unauthorized();

  const supabase = await createClient();
  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const categories = await getCategories(supabase, householdId);
    return json(categories);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await verifySession();
  if (!user) return unauthorized();
  const householdId = await getHouseholdId(user.id);
  if (!householdId) return unauthorized();

  const parsed = await parseBody(request, categoryCreateSchema);
  if ('response' in parsed) return parsed.response;

  const supabase = await createClient();
  try {
    const category = await createCategory(supabase, householdId, parsed.data);
    return json(category, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
