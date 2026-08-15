import { categoryCreateSchema } from '@/lib/validation';
import { json, parseBody, requireHousehold } from '@/lib/api/http';
import { getCategories } from '@/lib/queries/categories';
import { createCategory } from '@/lib/mutations/categories';

export async function GET() {
  const ctx = await requireHousehold();
  if ('response' in ctx) return ctx.response;

  try {
    const categories = await getCategories(ctx.supabase, ctx.householdId);
    return json(categories);
  } catch (error) {
    console.error('GET /api/categories failed', error);
    return json({ error: 'Failed to load categories' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const ctx = await requireHousehold();
  if ('response' in ctx) return ctx.response;

  const parsed = await parseBody(request, categoryCreateSchema);
  if ('response' in parsed) return parsed.response;

  try {
    const category = await createCategory(
      ctx.supabase,
      ctx.householdId,
      parsed.data
    );
    return json(category, { status: 201 });
  } catch (error) {
    console.error('POST /api/categories failed', error);
    return json({ error: 'Failed to add the category' }, { status: 500 });
  }
}
