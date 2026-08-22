'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import {
  holidayCreateSchema,
  incomeScheduleCreateSchema,
  incomeStreamCreateSchema,
  incomeStreamUpdateSchema,
  workCalendarUpdateSchema,
} from '@/lib/horizon/income/validation';
import {
  createHoliday,
  createIncomeSchedule,
  createIncomeStream,
  deleteHoliday as deleteHolidayRow,
  deleteIncomeSchedule as deleteIncomeScheduleRow,
  deleteIncomeStream as deleteIncomeStreamRow,
  updateIncomeStream,
  updateWorkCalendar,
} from '@/lib/horizon/mutations/income';
import { reportError } from '@/lib/observability';
import type { ActionResult } from './expenses';

/**
 * Add an income stream. Server Actions are reachable by direct POST, so we
 * verify the session here regardless of any client-side gating.
 */
export async function addIncomeStream(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = incomeStreamCreateSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: t('checkIncomeStreamFields') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await createIncomeStream(supabase, householdId, parsed.data);
  } catch (error) {
    reportError('addIncomeStream', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/horizon/money-in');
  return { ok: true };
}

/**
 * Edit an income stream (rename, change amounts, recurrence, confidence,
 * archive/restore), scoped to the caller's household. A missing row is
 * reported as a friendly error, not a crash.
 */
export async function editIncomeStream(
  id: string,
  input: unknown
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = incomeStreamUpdateSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: t('checkIncomeStreamFields') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    const updated = await updateIncomeStream(
      supabase,
      householdId,
      id,
      parsed.data
    );
    if (!updated) return { ok: false, error: t('incomeStreamNotFound') };
  } catch (error) {
    reportError('editIncomeStream', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/horizon/money-in');
  return { ok: true };
}

export async function deleteIncomeStream(id: string): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    const deleted = await deleteIncomeStreamRow(supabase, householdId, id);
    if (!deleted) return { ok: false, error: t('incomeStreamNotFound') };
  } catch (error) {
    reportError('deleteIncomeStream', error);
    return { ok: false, error: t('removeFailed') };
  }

  revalidatePath('/horizon/money-in');
  return { ok: true };
}

/** Add a payment schedule to a stream — a stream can carry several. */
export async function addIncomeSchedule(
  incomeStreamId: string,
  input: unknown
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = incomeScheduleCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('checkScheduleFields') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await createIncomeSchedule(
      supabase,
      householdId,
      incomeStreamId,
      parsed.data
    );
  } catch (error) {
    reportError('addIncomeSchedule', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/horizon/money-in');
  return { ok: true };
}

export async function deleteIncomeSchedule(id: string): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    const deleted = await deleteIncomeScheduleRow(supabase, householdId, id);
    if (!deleted) return { ok: false, error: t('scheduleNotFound') };
  } catch (error) {
    reportError('deleteIncomeSchedule', error);
    return { ok: false, error: t('removeFailed') };
  }

  revalidatePath('/horizon/money-in');
  return { ok: true };
}

/** Replaces the household's working weekdays. */
export async function setWorkCalendar(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = workCalendarUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('checkWorkCalendar') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await updateWorkCalendar(supabase, householdId, parsed.data);
  } catch (error) {
    reportError('setWorkCalendar', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/horizon/assumptions');
  revalidatePath('/horizon/money-in');
  return { ok: true };
}

export async function addHoliday(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = holidayCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('checkHoliday') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await createHoliday(supabase, householdId, parsed.data);
  } catch (error) {
    reportError('addHoliday', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/horizon/assumptions');
  revalidatePath('/horizon/money-in');
  return { ok: true };
}

export async function deleteHoliday(id: string): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    const deleted = await deleteHolidayRow(supabase, householdId, id);
    if (!deleted) return { ok: false, error: t('holidayNotFound') };
  } catch (error) {
    reportError('deleteHoliday', error);
    return { ok: false, error: t('removeFailed') };
  }

  revalidatePath('/horizon/assumptions');
  revalidatePath('/horizon/money-in');
  return { ok: true };
}
