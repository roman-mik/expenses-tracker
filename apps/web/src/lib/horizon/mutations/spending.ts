/**
 * Horizon obligation and spending mutations: create/update/delete for
 * obligations, schedules, daily expenses, and one-off events. Same idiom as
 * `@/lib/horizon/mutations/income`.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type {
  DailyExpense,
  Obligation,
  ObligationSchedule,
  OneOffEvent,
} from '../spending/types';
import {
  toDailyExpense,
  toObligation,
  toObligationSchedule,
  toOneOffEvent,
  type HorizonDailyExpenseRow,
  type HorizonObligationRow,
  type HorizonObligationScheduleRow,
  type HorizonOneOffEventRow,
} from '../spending/mappers';
import type {
  DailyExpenseCreateInput,
  DailyExpenseUpdateInput,
  ObligationCreateInput,
  ObligationScheduleCreateInput,
  ObligationUpdateInput,
  OneOffEventCreateInput,
  OneOffEventUpdateInput,
} from '../spending/validation';

const OBLIGATION_COLUMNS =
  'id, account_id, name, category, amount_minor, currency, recurrence, confidence, start_date, end_date, sort_order, archived';

const SCHEDULE_COLUMNS =
  'id, obligation_id, kind, day_of_month, interval_days, nth_weekday, weekday, anchor_date, slippage_policy, covers_period';

const DAILY_EXPENSE_COLUMNS =
  'id, account_id, pocket_category_id, name, daily_amount_minor, currency, charge_cadence, cap_minor, start_date, end_date, archived';

const ONE_OFF_EVENT_COLUMNS =
  'id, account_id, name, category, amount_minor, currency, date, direction';

/** New obligations are appended after the current highest `sort_order`. */
export async function createObligation(
  supabase: SupabaseServerClient,
  householdId: string,
  input: ObligationCreateInput
): Promise<Obligation> {
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const { data: last, error: sErr } = await supabase
      .from('horizon_obligations')
      .select('sort_order')
      .eq('household_id', householdId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    sortOrder = (last?.sort_order ?? -1) + 1;
  }

  const { data, error } = await supabase
    .from('horizon_obligations')
    .insert({
      household_id: householdId,
      account_id: input.accountId,
      name: input.name,
      category: input.category,
      amount_minor: input.amountMinor,
      currency: input.currency,
      recurrence: input.recurrence ?? 'recurring',
      confidence: input.confidence ?? 'confirmed',
      start_date: input.startDate,
      end_date: input.endDate ?? null,
      sort_order: sortOrder,
    })
    .select(OBLIGATION_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return toObligation(data as HorizonObligationRow);
}

/**
 * Edit an obligation, scoped to the household. Returns the updated row, or
 * `null` if no row in this household matched the id.
 */
export async function updateObligation(
  supabase: SupabaseServerClient,
  householdId: string,
  id: string,
  input: ObligationUpdateInput
): Promise<Obligation | null> {
  const patch: Partial<HorizonObligationRow> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.accountId !== undefined) patch.account_id = input.accountId;
  if (input.category !== undefined) patch.category = input.category;
  if (input.amountMinor !== undefined) patch.amount_minor = input.amountMinor;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.recurrence !== undefined) patch.recurrence = input.recurrence;
  if (input.confidence !== undefined) patch.confidence = input.confidence;
  if (input.startDate !== undefined) patch.start_date = input.startDate;
  if (input.endDate !== undefined) patch.end_date = input.endDate;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.archived !== undefined) patch.archived = input.archived;

  const { data, error } = await supabase
    .from('horizon_obligations')
    .update(patch)
    .eq('id', id)
    .eq('household_id', householdId)
    .select(OBLIGATION_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toObligation(data as HorizonObligationRow) : null;
}

/** Deletes an obligation and (via `on delete cascade`) its schedules. */
export async function deleteObligation(
  supabase: SupabaseServerClient,
  householdId: string,
  id: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('horizon_obligations')
    .delete()
    .eq('id', id)
    .eq('household_id', householdId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data !== null;
}

export async function createObligationSchedule(
  supabase: SupabaseServerClient,
  householdId: string,
  obligationId: string,
  input: ObligationScheduleCreateInput
): Promise<ObligationSchedule> {
  const { data, error } = await supabase
    .from('horizon_obligation_schedules')
    .insert({
      household_id: householdId,
      obligation_id: obligationId,
      kind: input.kind,
      day_of_month: input.kind === 'dayOfMonth' ? input.dayOfMonth : null,
      interval_days: input.kind === 'everyNDays' ? input.intervalDays : null,
      nth_weekday: input.kind === 'nthWeekday' ? input.nthWeekday : null,
      weekday: input.kind === 'nthWeekday' ? input.weekday : null,
      anchor_date:
        input.kind === 'everyNDays' || input.kind === 'oneOff'
          ? input.anchorDate
          : null,
      slippage_policy: input.slippagePolicy ?? 'nextBusinessDay',
      covers_period: input.coversPeriod ?? 'same',
    })
    .select(SCHEDULE_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return toObligationSchedule(data as HorizonObligationScheduleRow);
}

export async function deleteObligationSchedule(
  supabase: SupabaseServerClient,
  householdId: string,
  id: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('horizon_obligation_schedules')
    .delete()
    .eq('id', id)
    .eq('household_id', householdId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data !== null;
}

export async function createDailyExpense(
  supabase: SupabaseServerClient,
  householdId: string,
  input: DailyExpenseCreateInput
): Promise<DailyExpense> {
  const { data, error } = await supabase
    .from('horizon_daily_expenses')
    .insert({
      household_id: householdId,
      account_id: input.accountId,
      pocket_category_id: input.pocketCategoryId ?? null,
      name: input.name,
      daily_amount_minor: input.dailyAmountMinor,
      currency: input.currency,
      charge_cadence: input.chargeCadence ?? 'daily',
      cap_minor: input.capMinor ?? null,
      start_date: input.startDate,
      end_date: input.endDate ?? null,
    })
    .select(DAILY_EXPENSE_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return toDailyExpense(data as HorizonDailyExpenseRow);
}

/**
 * Edit a daily expense, scoped to the household. Returns the updated row,
 * or `null` if no row in this household matched the id.
 */
export async function updateDailyExpense(
  supabase: SupabaseServerClient,
  householdId: string,
  id: string,
  input: DailyExpenseUpdateInput
): Promise<DailyExpense | null> {
  const patch: Partial<HorizonDailyExpenseRow> = {};
  if (input.accountId !== undefined) patch.account_id = input.accountId;
  if (input.pocketCategoryId !== undefined)
    patch.pocket_category_id = input.pocketCategoryId;
  if (input.name !== undefined) patch.name = input.name;
  if (input.dailyAmountMinor !== undefined)
    patch.daily_amount_minor = input.dailyAmountMinor;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.chargeCadence !== undefined)
    patch.charge_cadence = input.chargeCadence;
  if (input.capMinor !== undefined) patch.cap_minor = input.capMinor;
  if (input.startDate !== undefined) patch.start_date = input.startDate;
  if (input.endDate !== undefined) patch.end_date = input.endDate;
  if (input.archived !== undefined) patch.archived = input.archived;

  const { data, error } = await supabase
    .from('horizon_daily_expenses')
    .update(patch)
    .eq('id', id)
    .eq('household_id', householdId)
    .select(DAILY_EXPENSE_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toDailyExpense(data as HorizonDailyExpenseRow) : null;
}

export async function deleteDailyExpense(
  supabase: SupabaseServerClient,
  householdId: string,
  id: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('horizon_daily_expenses')
    .delete()
    .eq('id', id)
    .eq('household_id', householdId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data !== null;
}

export async function createOneOffEvent(
  supabase: SupabaseServerClient,
  householdId: string,
  input: OneOffEventCreateInput
): Promise<OneOffEvent> {
  const { data, error } = await supabase
    .from('horizon_one_off_events')
    .insert({
      household_id: householdId,
      account_id: input.accountId,
      name: input.name,
      category: input.category,
      amount_minor: input.amountMinor,
      currency: input.currency,
      date: input.date,
      direction: input.direction,
    })
    .select(ONE_OFF_EVENT_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return toOneOffEvent(data as HorizonOneOffEventRow);
}

/**
 * Edit a one-off event, scoped to the household. Returns the updated row,
 * or `null` if no row in this household matched the id.
 */
export async function updateOneOffEvent(
  supabase: SupabaseServerClient,
  householdId: string,
  id: string,
  input: OneOffEventUpdateInput
): Promise<OneOffEvent | null> {
  const patch: Partial<HorizonOneOffEventRow> = {};
  if (input.accountId !== undefined) patch.account_id = input.accountId;
  if (input.name !== undefined) patch.name = input.name;
  if (input.category !== undefined) patch.category = input.category;
  if (input.amountMinor !== undefined) patch.amount_minor = input.amountMinor;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.date !== undefined) patch.date = input.date;
  if (input.direction !== undefined) patch.direction = input.direction;

  const { data, error } = await supabase
    .from('horizon_one_off_events')
    .update(patch)
    .eq('id', id)
    .eq('household_id', householdId)
    .select(ONE_OFF_EVENT_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toOneOffEvent(data as HorizonOneOffEventRow) : null;
}

export async function deleteOneOffEvent(
  supabase: SupabaseServerClient,
  householdId: string,
  id: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('horizon_one_off_events')
    .delete()
    .eq('id', id)
    .eq('household_id', householdId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data !== null;
}
