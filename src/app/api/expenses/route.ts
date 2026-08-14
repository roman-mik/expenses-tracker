import { NextRequest } from 'next/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { expenseCreateSchema, monthParamSchema } from '@/lib/validation';
import { badRequest, json, parseBody, unauthorized } from '@/lib/api/http';
import { listExpenses } from '@/lib/queries/expenses';
import { createExpense } from '@/lib/mutations/expenses';

export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return unauthorized();

  const monthRaw = request.nextUrl.searchParams.get('month');
  const category = request.nextUrl.searchParams.get('category');

  let month: string | undefined;
  if (monthRaw !== null) {
    const parsed = monthParamSchema.safeParse(monthRaw);
    if (!parsed.success) return badRequest(parsed.error.flatten());
    month = parsed.data;
  }

  const supabase = await createClient();
  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const expenses = await listExpenses(supabase, householdId, {
      month,
      categoryId: category ?? undefined,
    });
    return json(expenses);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await verifySession();
  if (!user) return unauthorized();

  const parsed = await parseBody(request, expenseCreateSchema);
  if ('response' in parsed) return parsed.response;

  const supabase = await createClient();
  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const expense = await createExpense(
      supabase,
      householdId,
      user.id,
      parsed.data
    );
    return json(expense, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}
