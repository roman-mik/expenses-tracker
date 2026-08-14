/**
 * Expense create, shared by `POST /api/expenses` and the `addExpense` Server
 * Action. Currency is stamped from the profile — never trusted from the client.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { Expense } from '@/lib/types';
import { toExpense, type ExpenseRow } from '@/lib/mappers';
import type { ExpenseCreateInput, ExpenseUpdateInput } from '@/lib/validation';

/** Columns selected everywhere an expense round-trips back to the domain layer. */
const EXPENSE_COLUMNS =
  'id, category_id, amount_minor, currency, note, spent_at, user_id';

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
    .select(EXPENSE_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return toExpense(data as ExpenseRow);
}

/**
 * Edit an expense, scoped to the household (any member may edit any household
 * expense — shared pool). Currency is never patched: it stays as stamped at
 * insert. A field is only touched when the caller sends it (`undefined` means
 * "leave unchanged"; explicit `null` clears category/note). Returns the updated
 * expense, or `null` if no row in this household matched the id.
 */
export async function updateExpense(
  supabase: SupabaseServerClient,
  householdId: string,
  id: string,
  input: ExpenseUpdateInput
): Promise<Expense | null> {
  const { amountMinor, categoryId, note, spentAt } = input;

  const patch: Partial<ExpenseRow> = {};
  if (amountMinor !== undefined) patch.amount_minor = amountMinor;
  if (categoryId !== undefined) patch.category_id = categoryId;
  if (note !== undefined) patch.note = note;
  if (spentAt !== undefined) patch.spent_at = spentAt;

  const { data, error } = await supabase
    .from('expenses')
    .update(patch)
    .eq('id', id)
    .eq('household_id', householdId)
    .select(EXPENSE_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toExpense(data as ExpenseRow) : null;
}

/**
 * Delete an expense, scoped to the household. Returns whether a row was
 * actually removed (false = not in this household / already gone).
 */
export async function deleteExpense(
  supabase: SupabaseServerClient,
  householdId: string,
  id: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', id)
    .eq('household_id', householdId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data !== null;
}
