import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { toCategory, type CategoryRow } from '@/lib/mappers';
import { categoryCreateSchema } from '@/lib/validation';
import { json, parseBody, unauthorized } from '@/lib/api/http';
import { getCategories } from '@/lib/queries/categories';

export async function GET() {
  const user = await verifySession();
  if (!user) return unauthorized();

  const supabase = await createClient();
  try {
    const categories = await getCategories(supabase, user.id);
    return json(categories);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await verifySession();
  if (!user) return unauthorized();

  const parsed = await parseBody(request, categoryCreateSchema);
  if ('response' in parsed) return parsed.response;
  const { name, color, sortOrder } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('categories')
    .insert({
      user_id: user.id,
      name,
      color,
      ...(sortOrder !== undefined ? { sort_order: sortOrder } : {}),
    })
    .select('id, name, color, sort_order, archived')
    .single();

  if (error) return json({ error: error.message }, { status: 500 });
  return json(toCategory(data as CategoryRow), { status: 201 });
}
