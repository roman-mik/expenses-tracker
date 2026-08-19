/**
 * Horizon income queries — streams (with their schedules), work calendar,
 * and holidays. Same idiom as `@/lib/horizon/queries/accounts`.
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

const STREAM_COLUMNS =
  'id, account_id, name, kind, currency, hourly_rate_minor, hours_per_day_e2, fixed_amount_minor, recurrence, confidence, taxable, start_date, end_date, sort_order, archived';

const SCHEDULE_COLUMNS =
  'id, income_stream_id, kind, day_of_month, interval_days, nth_weekday, weekday, anchor_date, slippage_policy, covers_period';

export async function getIncomeStreams(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<IncomeStream[]> {
  const { data, error } = await supabase
    .from('horizon_income_streams')
    .select(STREAM_COLUMNS)
    .eq('household_id', householdId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as HorizonIncomeStreamRow[]).map(toIncomeStream);
}

/** All schedules for every stream in the household, in one round trip. */
export async function getIncomeSchedules(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<IncomeSchedule[]> {
  const { data, error } = await supabase
    .from('horizon_income_schedules')
    .select(SCHEDULE_COLUMNS)
    .eq('household_id', householdId);

  if (error) throw new Error(error.message);
  return (data as HorizonIncomeScheduleRow[]).map(toIncomeSchedule);
}

export async function getSchedulesForStream(
  supabase: SupabaseServerClient,
  householdId: string,
  incomeStreamId: string
): Promise<IncomeSchedule[]> {
  const { data, error } = await supabase
    .from('horizon_income_schedules')
    .select(SCHEDULE_COLUMNS)
    .eq('household_id', householdId)
    .eq('income_stream_id', incomeStreamId);

  if (error) throw new Error(error.message);
  return (data as HorizonIncomeScheduleRow[]).map(toIncomeSchedule);
}

/** Falls back to the default calendar (Mon-Fri) if the household has never written one. */
export async function getWorkCalendar(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<WorkCalendar> {
  const { data, error } = await supabase
    .from('horizon_work_calendars')
    .select('working_weekdays')
    .eq('household_id', householdId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { workingWeekdays: [1, 2, 3, 4, 5] };
  return toWorkCalendar(data as HorizonWorkCalendarRow);
}

export async function getHolidays(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<Holiday[]> {
  const { data, error } = await supabase
    .from('horizon_holidays')
    .select('id, date, name')
    .eq('household_id', householdId)
    .order('date', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as HorizonHolidayRow[]).map(toHoliday);
}
