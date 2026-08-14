/**
 * Expense list query, shared by `GET /api/expenses` and the Home "today" list.
 * Month boundaries respect the user's timezone via `monthWindow`.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { Expense } from '@/lib/types';
import { toExpense, type ExpenseRow } from '@/lib/mappers';
import { getHousehold } from '@/lib/queries/household';
import { monthWindow } from '@/lib/kapa-math';

export interface ListExpensesOptions {
  /** 'YYYY-MM' — already validated by the caller. */
  month?: string;
  categoryId?: string;
}

export async function listExpenses(
  supabase: SupabaseServerClient,
  householdId: string,
  { month, categoryId }: ListExpensesOptions = {}
): Promise<Expense[]> {
  // Shared pool: `user_id` comes back as attribution (`addedBy`), not a filter.
  let query = supabase
    .from('expenses')
    .select('id, category_id, amount_minor, currency, note, spent_at, user_id')
    .eq('household_id', householdId)
    .order('spent_at', { ascending: false });

  if (month) {
    const { timezone } = await getHousehold(supabase, householdId);
    const { startUtc, endUtc } = monthWindow(month, timezone);
    query = query
      .gte('spent_at', startUtc.toISOString())
      .lt('spent_at', endUtc.toISOString());
  }

  if (categoryId) query = query.eq('category_id', categoryId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as ExpenseRow[]).map(toExpense);
}
