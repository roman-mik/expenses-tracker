import { categoryUpdateSchema } from '@/lib/validation';
import { json, notFound, parseBody, requireHousehold } from '@/lib/api/http';
import { updateCategory } from '@/lib/mutations/categories';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireHousehold();
  if ('response' in ctx) return ctx.response;
  const { id } = await params;

  const parsed = await parseBody(request, categoryUpdateSchema);
  if ('response' in parsed) return parsed.response;

  try {
    const category = await updateCategory(
      ctx.supabase,
      ctx.householdId,
      id,
      parsed.data
    );
    if (!category) return notFound();
    return json(category);
  } catch (error) {
    console.error('PATCH /api/categories/[id] failed', error);
    return json({ error: 'Failed to update the category' }, { status: 500 });
  }
}
