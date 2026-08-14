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
  userId: string,
  input: ExpenseCreateInput
): Promise<Expense> {
  const { amountMinor, categoryId, note, spentAt } = input;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('currency')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  // Fall back to the default currency if the profile isn't seeded yet.
  const currency = profile?.currency ?? 'RSD';

  const { data, error } = await supabase
    .from('expenses')
    .insert({
      user_id: userId,
      category_id: categoryId ?? null,
      amount_minor: amountMinor,
      currency,
      note: note ?? null,
      ...(spentAt ? { spent_at: spentAt } : {}),
    })
    .select('id, category_id, amount_minor, currency, note, spent_at')
    .single();

  if (error) throw new Error(error.message);
  return toExpense(data as ExpenseRow);
}
