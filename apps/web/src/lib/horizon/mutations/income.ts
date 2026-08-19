/**
 * Horizon income mutations: stream create/update/reorder/delete, schedule
 * create/delete, work calendar upsert, holiday create/delete. Same idiom as
 * `@/lib/horizon/mutations/accounts`.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type {
  Holiday,
  IncomeSchedule,
  IncomeStream,
  WorkCalendar,
} from '../income/types';
import {
  toHoliday,
  toIncomeSchedule,
  toIncomeStream,
  toWorkCalendar,
  type HorizonHolidayRow,
  type HorizonIncomeScheduleRow,
  type HorizonIncomeStreamRow,
  type HorizonWorkCalendarRow,
} from '../income/mappers';
import type {
  HolidayCreateInput,
  IncomeScheduleCreateInput,
  IncomeStreamCreateInput,
  IncomeStreamUpdateInput,
  WorkCalendarUpdateInput,
} from '../income/validation';

const STREAM_COLUMNS =
  'id, account_id, name, kind, currency, hourly_rate_minor, hours_per_day_e2, fixed_amount_minor, recurrence, confidence, taxable, start_date, end_date, sort_order, archived';

const SCHEDULE_COLUMNS =
  'id, income_stream_id, kind, day_of_month, interval_days, nth_weekday, weekday, anchor_date, slippage_policy, covers_period';

/** New streams are appended after the current highest `sort_order`. */
export async function createIncomeStream(
  supabase: SupabaseServerClient,
  householdId: string,
  input: IncomeStreamCreateInput
): Promise<IncomeStream> {
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const { data: last, error: sErr } = await supabase
      .from('horizon_income_streams')
      .select('sort_order')
      .eq('household_id', householdId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    sortOrder = (last?.sort_order ?? -1) + 1;
  }

  const { data, error } = await supabase
    .from('horizon_income_streams')
    .insert({
      household_id: householdId,
      account_id: input.accountId,
      name: input.name,
      kind: input.kind,
      currency: input.currency,
      hourly_rate_minor: input.kind === 'hourly' ? input.hourlyRateMinor : null,
      hours_per_day_e2:
        input.kind === 'hourly' ? Math.round(input.hoursPerDay * 100) : null,
      fixed_amount_minor:
        input.kind === 'hourly' ? null : input.fixedAmountMinor,
      recurrence: input.recurrence ?? 'recurring',
      confidence: input.confidence ?? 'confirmed',
      taxable: input.taxable ?? true,
      start_date: input.startDate,
      end_date: input.endDate ?? null,
      sort_order: sortOrder,
    })
    .select(STREAM_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return toIncomeStream(data as HorizonIncomeStreamRow);
}

/**
 * Edit a stream, scoped to the household. Returns the updated stream, or
 * `null` if no row in this household matched the id.
 */
export async function updateIncomeStream(
  supabase: SupabaseServerClient,
  householdId: string,
  id: string,
  input: IncomeStreamUpdateInput
): Promise<IncomeStream | null> {
  const patch: Partial<HorizonIncomeStreamRow> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.accountId !== undefined) patch.account_id = input.accountId;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.recurrence !== undefined) patch.recurrence = input.recurrence;
  if (input.confidence !== undefined) patch.confidence = input.confidence;
  if (input.taxable !== undefined) patch.taxable = input.taxable;
  if (input.startDate !== undefined) patch.start_date = input.startDate;
  if (input.endDate !== undefined) patch.end_date = input.endDate;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.archived !== undefined) patch.archived = input.archived;
  if (input.hourlyRateMinor !== undefined)
    patch.hourly_rate_minor = input.hourlyRateMinor;
  if (input.hoursPerDay !== undefined)
    patch.hours_per_day_e2 = Math.round(input.hoursPerDay * 100);
  if (input.fixedAmountMinor !== undefined)
    patch.fixed_amount_minor = input.fixedAmountMinor;

  const { data, error } = await supabase
    .from('horizon_income_streams')
    .update(patch)
    .eq('id', id)
    .eq('household_id', householdId)
    .select(STREAM_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toIncomeStream(data as HorizonIncomeStreamRow) : null;
}

/** Deletes a stream and (via `on delete cascade`) its schedules. */
export async function deleteIncomeStream(
  supabase: SupabaseServerClient,
  householdId: string,
  id: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('horizon_income_streams')
    .delete()
    .eq('id', id)
    .eq('household_id', householdId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data !== null;
}

export async function createIncomeSchedule(
  supabase: SupabaseServerClient,
  householdId: string,
  incomeStreamId: string,
  input: IncomeScheduleCreateInput
): Promise<IncomeSchedule> {
  const { data, error } = await supabase
    .from('horizon_income_schedules')
    .insert({
      household_id: householdId,
      income_stream_id: incomeStreamId,
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
  return toIncomeSchedule(data as HorizonIncomeScheduleRow);
}

export async function deleteIncomeSchedule(
  supabase: SupabaseServerClient,
  householdId: string,
  id: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('horizon_income_schedules')
    .delete()
    .eq('id', id)
    .eq('household_id', householdId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data !== null;
}

/** Upserts the household's single work calendar row. */
export async function updateWorkCalendar(
  supabase: SupabaseServerClient,
  householdId: string,
  input: WorkCalendarUpdateInput
): Promise<WorkCalendar> {
  const { data, error } = await supabase
    .from('horizon_work_calendars')
    .upsert(
      { household_id: householdId, working_weekdays: input.workingWeekdays },
      { onConflict: 'household_id' }
    )
    .select('working_weekdays')
    .single();

  if (error) throw new Error(error.message);
  return toWorkCalendar(data as HorizonWorkCalendarRow);
}

export async function createHoliday(
  supabase: SupabaseServerClient,
  householdId: string,
  input: HolidayCreateInput
): Promise<Holiday> {
  const { data, error } = await supabase
    .from('horizon_holidays')
    .insert({ household_id: householdId, date: input.date, name: input.name })
    .select('id, date, name')
    .single();

  if (error) throw new Error(error.message);
  return toHoliday(data as HorizonHolidayRow);
}

export async function deleteHoliday(
  supabase: SupabaseServerClient,
  householdId: string,
  id: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('horizon_holidays')
    .delete()
    .eq('id', id)
    .eq('household_id', householdId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data !== null;
}
