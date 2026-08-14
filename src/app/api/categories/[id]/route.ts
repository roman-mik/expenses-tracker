import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { categoryUpdateSchema } from '@/lib/validation';
import { json, notFound, parseBody, unauthorized } from '@/lib/api/http';
import { updateCategory } from '@/lib/mutations/categories';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifySession();
  if (!user) return unauthorized();
  const householdId = await getHouseholdId(user.id);
  if (!householdId) return unauthorized();
  const { id } = await params;

  const parsed = await parseBody(request, categoryUpdateSchema);
  if ('response' in parsed) return parsed.response;

  const supabase = await createClient();
  try {
    const category = await updateCategory(
      supabase,
      householdId,
      id,
      parsed.data
    );
    if (!category) return notFound();
    return json(category);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
