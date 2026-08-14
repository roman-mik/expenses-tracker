/**
 * Expense list query, shared by `GET /api/expenses` and the Home "today" list.
 * Month boundaries respect the user's timezone via `monthWindow`.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { Expense } from '@/lib/types';
import { toExpense, type ExpenseRow } from '@/lib/mappers';
import { monthWindow } from '@/lib/kapa-math';

export interface ListExpensesOptions {
  /** 'YYYY-MM' — already validated by the caller. */
  month?: string;
  categoryId?: string;
}

export async function listExpenses(
  supabase: SupabaseServerClient,
  userId: string,
  { month, categoryId }: ListExpensesOptions = {}
): Promise<Expense[]> {
  let query = supabase
    .from('expenses')
    .select('id, category_id, amount_minor, currency, note, spent_at')
    .eq('user_id', userId)
    .order('spent_at', { ascending: false });

  if (month) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle();
    const timezone = profile?.timezone ?? 'Europe/Belgrade';
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
