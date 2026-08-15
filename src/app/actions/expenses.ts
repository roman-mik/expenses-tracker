'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { expenseCreateSchema, expenseUpdateSchema } from '@/lib/validation';
import {
  createExpense,
  deleteExpense as deleteExpenseRow,
  updateExpense as updateExpenseRow,
} from '@/lib/mutations/expenses';

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Add an expense. Server Actions are reachable by direct POST, so we verify the
 * session here regardless of any client-side gating.
 */
export async function addExpense(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = expenseCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('checkAmount') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await createExpense(supabase, householdId, user.id, parsed.data);
  } catch {
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/');
  return { ok: true };
}

/**
 * Edit an existing expense. Scoped to the caller's household (RLS + query both
 * enforce it). A missing row (wrong household / already deleted) is reported as
 * a friendly error, not a crash.
 */
export async function updateExpense(
  id: string,
  input: unknown
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = expenseUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('checkAmount') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    const updated = await updateExpenseRow(
      supabase,
      householdId,
      id,
      parsed.data
    );
    if (!updated) return { ok: false, error: t('expenseNotFound') };
  } catch {
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/');
  revalidatePath('/history');
  return { ok: true };
}

/** Delete an expense, scoped to the caller's household. */
export async function deleteExpense(id: string): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    const removed = await deleteExpenseRow(supabase, householdId, id);
    if (!removed) return { ok: false, error: t('expenseNotFound') };
  } catch {
    return { ok: false, error: t('removeFailed') };
  }

  revalidatePath('/');
  revalidatePath('/history');
  return { ok: true };
}
