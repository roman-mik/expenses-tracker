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
import { reportError } from '@/lib/observability';

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
  } catch (error) {
    reportError('addExpense', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/');
  return { ok: true };
}

/**
 * Edit an existing expense. Scoped to the caller's household (RLS + query both
 * enforce it). `expectedUpdatedAt` is the optimistic-concurrency token — the
 * `updatedAt` the form last read; a mismatch means someone else edited this
 * expense first. A missing row (wrong household / already deleted) and a
 * conflict are both reported as friendly errors, not crashes — but distinct
 * ones, since "reload, this changed" and "this is gone" call for different
 * next steps from the person reading it.
 */
export async function updateExpense(
  id: string,
  input: unknown,
  expectedUpdatedAt: string
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
    const result = await updateExpenseRow(
      supabase,
      householdId,
      id,
      parsed.data,
      expectedUpdatedAt
    );
    if (!result.ok) {
      return {
        ok: false,
        error: t(
          result.reason === 'conflict' ? 'expenseChanged' : 'expenseNotFound'
        ),
      };
    }
  } catch (error) {
    reportError('updateExpense', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/');
  revalidatePath('/history');
  return { ok: true };
}

/**
 * Delete an expense, scoped to the caller's household. Same optimistic-
 * concurrency token as `updateExpense`.
 */
export async function deleteExpense(
  id: string,
  expectedUpdatedAt: string
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    const result = await deleteExpenseRow(
      supabase,
      householdId,
      id,
      expectedUpdatedAt
    );
    if (!result.ok) {
      return {
        ok: false,
        error: t(
          result.reason === 'conflict' ? 'expenseChanged' : 'expenseNotFound'
        ),
      };
    }
  } catch (error) {
    reportError('deleteExpense', error);
    return { ok: false, error: t('removeFailed') };
  }

  revalidatePath('/');
  revalidatePath('/history');
  return { ok: true };
}
