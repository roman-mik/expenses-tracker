/**
 * Horizon obligation and spending queries. Same idiom as
 * `@/lib/horizon/queries/income`.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { Money } from '@/lib/types';
import { getHousehold } from '@/lib/queries/household';
import { monthWindow } from '@/lib/pocket-math';
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

const OBLIGATION_COLUMNS =
  'id, account_id, name, category, amount_minor, currency, recurrence, confidence, start_date, end_date, sort_order, archived';

const SCHEDULE_COLUMNS =
  'id, obligation_id, kind, day_of_month, interval_days, nth_weekday, weekday, anchor_date, slippage_policy, covers_period';

const DAILY_EXPENSE_COLUMNS =
  'id, account_id, pocket_category_id, name, daily_amount_minor, currency, charge_cadence, cap_minor, start_date, end_date, archived';

const ONE_OFF_EVENT_COLUMNS =
  'id, account_id, name, category, amount_minor, currency, date, direction';

export async function getObligations(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<Obligation[]> {
  const { data, error } = await supabase
    .from('horizon_obligations')
    .select(OBLIGATION_COLUMNS)
    .eq('household_id', householdId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as HorizonObligationRow[]).map(toObligation);
}

/** All schedules for every obligation in the household, in one round trip. */
export async function getObligationSchedules(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<ObligationSchedule[]> {
  const { data, error } = await supabase
    .from('horizon_obligation_schedules')
    .select(SCHEDULE_COLUMNS)
    .eq('household_id', householdId);

  if (error) throw new Error(error.message);
  return (data as HorizonObligationScheduleRow[]).map(toObligationSchedule);
}

export async function getDailyExpenses(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<DailyExpense[]> {
  const { data, error } = await supabase
    .from('horizon_daily_expenses')
    .select(DAILY_EXPENSE_COLUMNS)
    .eq('household_id', householdId)
    .order('start_date', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as HorizonDailyExpenseRow[]).map(toDailyExpense);
}

export async function getOneOffEvents(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<OneOffEvent[]> {
  const { data, error } = await supabase
    .from('horizon_one_off_events')
    .select(ONE_OFF_EVENT_COLUMNS)
    .eq('household_id', householdId)
    .order('date', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as HorizonOneOffEventRow[]).map(toOneOffEvent);
}

/**
 * Sums Pocket's real `expenses` for the given category over the household's
 * `YYYY-MM` month (in the household's own timezone, same as `listExpenses`)
 * — the "actual" side of C4's cap tracker's planned-vs-actual comparison.
 * Returns 0 for a `null` category (no Pocket category linked) rather than
 * summing every expense in the household.
 */
export async function sumPocketExpenses(
  supabase: SupabaseServerClient,
  householdId: string,
  pocketCategoryId: string | null,
  month: string
): Promise<Money> {
  if (!pocketCategoryId) return 0 as Money;

  const { timezone } = await getHousehold(supabase, householdId);
  const { startUtc, endUtc } = monthWindow(month, timezone);

  const { data, error } = await supabase
    .from('expenses')
    .select('amount_minor')
    .eq('household_id', householdId)
    .eq('category_id', pocketCategoryId)
    .gte('spent_at', startUtc.toISOString())
    .lt('spent_at', endUtc.toISOString());

  if (error) throw new Error(error.message);
  const total = (data ?? []).reduce((sum, row) => sum + row.amount_minor, 0);
  return total as Money;
}

export async function getSchedulesForObligation(
  supabase: SupabaseServerClient,
  householdId: string,
  obligationId: string
): Promise<ObligationSchedule[]> {
  const { data, error } = await supabase
    .from('horizon_obligation_schedules')
    .select(SCHEDULE_COLUMNS)
    .eq('household_id', householdId)
    .eq('obligation_id', obligationId);

  if (error) throw new Error(error.message);
  return (data as HorizonObligationScheduleRow[]).map(toObligationSchedule);
}
