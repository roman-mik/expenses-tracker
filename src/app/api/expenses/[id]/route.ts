import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { toExpense, type ExpenseRow } from '@/lib/mappers';
import { expenseUpdateSchema } from '@/lib/validation';
import { json, notFound, parseBody, unauthorized } from '@/lib/api/http';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifySession();
  if (!user) return unauthorized();
  const { id } = await params;

  const parsed = await parseBody(request, expenseUpdateSchema);
  if ('response' in parsed) return parsed.response;
  const { amountMinor, categoryId, note, spentAt } = parsed.data;

  // Currency is never patched from the client — it stays as stamped at insert.
  const patch: Record<string, unknown> = {};
  if (amountMinor !== undefined) patch.amount_minor = amountMinor;
  if (categoryId !== undefined) patch.category_id = categoryId;
  if (note !== undefined) patch.note = note;
  if (spentAt !== undefined) patch.spent_at = spentAt;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('expenses')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, category_id, amount_minor, currency, note, spent_at')
    .maybeSingle();

  if (error) return json({ error: error.message }, { status: 500 });
  if (!data) return notFound();
  return json(toExpense(data as ExpenseRow));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifySession();
  if (!user) return unauthorized();
  const { id } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) return json({ error: error.message }, { status: 500 });
  if (!data) return notFound();
  return json({ id: data.id });
}
