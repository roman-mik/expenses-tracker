'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import {
  dailyExpenseCreateSchema,
  dailyExpenseUpdateSchema,
  obligationCreateSchema,
  obligationScheduleCreateSchema,
  obligationUpdateSchema,
  oneOffEventCreateSchema,
  oneOffEventUpdateSchema,
} from '@/lib/horizon/spending/validation';
import {
  createDailyExpense,
  createObligation,
  createObligationSchedule,
  createOneOffEvent,
  deleteDailyExpense as deleteDailyExpenseRow,
  deleteObligation as deleteObligationRow,
  deleteObligationSchedule as deleteObligationScheduleRow,
  deleteOneOffEvent as deleteOneOffEventRow,
  updateDailyExpense,
  updateObligation,
  updateOneOffEvent,
} from '@/lib/horizon/mutations/spending';
import { reportError } from '@/lib/observability';
import type { ActionResult } from './expenses';

/**
 * Add an obligation. Server Actions are reachable by direct POST, so we
 * verify the session here regardless of any client-side gating.
 */
export async function addObligation(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = obligationCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('checkObligationFields') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await createObligation(supabase, householdId, parsed.data);
  } catch (error) {
    reportError('addObligation', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/horizon/money-out');
  return { ok: true };
}

/**
 * Edit an obligation (rename, change amounts, recurrence, confidence,
 * archive/restore), scoped to the caller's household. A missing row is
 * reported as a friendly error, not a crash.
 */
export async function editObligation(
  id: string,
  input: unknown
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = obligationUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('checkObligationFields') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    const updated = await updateObligation(
      supabase,
      householdId,
      id,
      parsed.data
    );
    if (!updated) return { ok: false, error: t('obligationNotFound') };
  } catch (error) {
    reportError('editObligation', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/horizon/money-out');
  return { ok: true };
}

export async function deleteObligation(id: string): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    const deleted = await deleteObligationRow(supabase, householdId, id);
    if (!deleted) return { ok: false, error: t('obligationNotFound') };
  } catch (error) {
    reportError('deleteObligation', error);
    return { ok: false, error: t('removeFailed') };
  }

  revalidatePath('/horizon/money-out');
  return { ok: true };
}

/** Add a payment schedule to an obligation — an obligation can carry several. */
export async function addObligationSchedule(
  obligationId: string,
  input: unknown
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = obligationScheduleCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('checkScheduleFields') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await createObligationSchedule(
      supabase,
      householdId,
      obligationId,
      parsed.data
    );
  } catch (error) {
    reportError('addObligationSchedule', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/horizon/money-out');
  return { ok: true };
}

export async function deleteObligationSchedule(
  id: string
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    const deleted = await deleteObligationScheduleRow(
      supabase,
      householdId,
      id
    );
    if (!deleted) return { ok: false, error: t('scheduleNotFound') };
  } catch (error) {
    reportError('deleteObligationSchedule', error);
    return { ok: false, error: t('removeFailed') };
  }

  revalidatePath('/horizon/money-out');
  return { ok: true };
}

export async function addDailyExpense(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = dailyExpenseCreateSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: t('checkDailyExpenseFields') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await createDailyExpense(supabase, householdId, parsed.data);
  } catch (error) {
    reportError('addDailyExpense', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/horizon/money-out');
  return { ok: true };
}

export async function editDailyExpense(
  id: string,
  input: unknown
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = dailyExpenseUpdateSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: t('checkDailyExpenseFields') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    const updated = await updateDailyExpense(
      supabase,
      householdId,
      id,
      parsed.data
    );
    if (!updated) return { ok: false, error: t('dailyExpenseNotFound') };
  } catch (error) {
    reportError('editDailyExpense', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/horizon/money-out');
  return { ok: true };
}

export async function deleteDailyExpense(id: string): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    const deleted = await deleteDailyExpenseRow(supabase, householdId, id);
    if (!deleted) return { ok: false, error: t('dailyExpenseNotFound') };
  } catch (error) {
    reportError('deleteDailyExpense', error);
    return { ok: false, error: t('removeFailed') };
  }

  revalidatePath('/horizon/money-out');
  return { ok: true };
}

export async function addOneOffEvent(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = oneOffEventCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('checkOneOffEventFields') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await createOneOffEvent(supabase, householdId, parsed.data);
  } catch (error) {
    reportError('addOneOffEvent', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/horizon/money-out');
  return { ok: true };
}

export async function editOneOffEvent(
  id: string,
  input: unknown
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = oneOffEventUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('checkOneOffEventFields') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    const updated = await updateOneOffEvent(
      supabase,
      householdId,
      id,
      parsed.data
    );
    if (!updated) return { ok: false, error: t('oneOffEventNotFound') };
  } catch (error) {
    reportError('editOneOffEvent', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/horizon/money-out');
  return { ok: true };
}

export async function deleteOneOffEvent(id: string): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    const deleted = await deleteOneOffEventRow(supabase, householdId, id);
    if (!deleted) return { ok: false, error: t('oneOffEventNotFound') };
  } catch (error) {
    reportError('deleteOneOffEvent', error);
    return { ok: false, error: t('removeFailed') };
  }

  revalidatePath('/horizon/money-out');
  return { ok: true };
}
