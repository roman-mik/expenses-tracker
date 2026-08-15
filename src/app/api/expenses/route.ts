import { NextRequest } from 'next/server';
import { expenseCreateSchema, monthParamSchema } from '@/lib/validation';
import { badRequest, json, parseBody, requireHousehold } from '@/lib/api/http';
import { listExpenses } from '@/lib/queries/expenses';
import { createExpense } from '@/lib/mutations/expenses';

export async function GET(request: NextRequest) {
  const ctx = await requireHousehold();
  if ('response' in ctx) return ctx.response;

  const monthRaw = request.nextUrl.searchParams.get('month');
  const category = request.nextUrl.searchParams.get('category');

  let month: string | undefined;
  if (monthRaw !== null) {
    const parsed = monthParamSchema.safeParse(monthRaw);
    if (!parsed.success) return badRequest(parsed.error.flatten());
    month = parsed.data;
  }

  try {
    const expenses = await listExpenses(ctx.supabase, ctx.householdId, {
      month,
      categoryId: category ?? undefined,
    });
    return json(expenses);
  } catch (error) {
    console.error('GET /api/expenses failed', error);
    return json({ error: 'Failed to load expenses' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const ctx = await requireHousehold();
  if ('response' in ctx) return ctx.response;

  const parsed = await parseBody(request, expenseCreateSchema);
  if ('response' in parsed) return parsed.response;

  try {
    const expense = await createExpense(
      ctx.supabase,
      ctx.householdId,
      ctx.user.id,
      parsed.data
    );
    return json(expense, { status: 201 });
  } catch (error) {
    console.error('POST /api/expenses failed', error);
    return json({ error: 'Failed to add the expense' }, { status: 500 });
  }
}
