import { toExpense, type ExpenseRow } from '@/lib/mappers';
import { expenseUpdateSchema } from '@/lib/validation';
import { json, notFound, parseBody, requireHousehold } from '@/lib/api/http';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireHousehold();
  if ('response' in ctx) return ctx.response;
  const { id } = await params;

  const parsed = await parseBody(request, expenseUpdateSchema);
  if ('response' in parsed) return parsed.response;
  const { amountMinor, categoryId, note, spentAt } = parsed.data;

  // Currency is never patched from the client — it stays as stamped at insert.
  const patch: Partial<ExpenseRow> = {};
  if (amountMinor !== undefined) patch.amount_minor = amountMinor;
  if (categoryId !== undefined) patch.category_id = categoryId;
  if (note !== undefined) patch.note = note;
  if (spentAt !== undefined) patch.spent_at = spentAt;

  // Shared pool: any member may edit any household expense (scoped by household,
  // not by author). RLS enforces the same.
  const { data, error } = await ctx.supabase
    .from('expenses')
    .update(patch)
    .eq('id', id)
    .eq('household_id', ctx.householdId)
    .select('id, category_id, amount_minor, currency, note, spent_at, user_id')
    .maybeSingle();

  if (error) {
    console.error('PATCH /api/expenses/[id] failed', error);
    return json({ error: 'Failed to update the expense' }, { status: 500 });
  }
  if (!data) return notFound();
  return json(toExpense(data as ExpenseRow));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireHousehold();
  if ('response' in ctx) return ctx.response;
  const { id } = await params;

  const { data, error } = await ctx.supabase
    .from('expenses')
    .delete()
    .eq('id', id)
    .eq('household_id', ctx.householdId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('DELETE /api/expenses/[id] failed', error);
    return json({ error: 'Failed to remove the expense' }, { status: 500 });
  }
  if (!data) return notFound();
  return json({ id: data.id });
}
