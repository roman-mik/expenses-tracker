/**
 * Expense create, shared by `POST /api/expenses` and the `addExpense` Server
 * Action. Currency is stamped from the profile — never trusted from the client.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { Expense } from '@/lib/types';
import { toExpense, type ExpenseRow } from '@/lib/mappers';
import type { ExpenseCreateInput } from '@/lib/validation';

export async function createExpense(
  supabase: SupabaseServerClient,
  householdId: string,
  userId: string,
  input: ExpenseCreateInput
): Promise<Expense> {
  const { amountMinor, categoryId, note, spentAt } = input;

  const { data: household, error: hErr } = await supabase
    .from('households')
    .select('currency')
    .eq('id', householdId)
    .maybeSingle();
  if (hErr) throw new Error(hErr.message);
  // Fall back to the default currency if the household isn't seeded yet.
  const currency = household?.currency ?? 'RSD';

  const { data, error } = await supabase
    .from('expenses')
    .insert({
      household_id: householdId,
      user_id: userId, // attribution: who logged it
      category_id: categoryId ?? null,
      amount_minor: amountMinor,
      currency,
      note: note ?? null,
      ...(spentAt ? { spent_at: spentAt } : {}),
    })
    .select('id, category_id, amount_minor, currency, note, spent_at, user_id')
    .single();

  if (error) throw new Error(error.message);
  return toExpense(data as ExpenseRow);
}
