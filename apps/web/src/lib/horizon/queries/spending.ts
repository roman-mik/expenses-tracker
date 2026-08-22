/**
 * Horizon obligation queries. Same idiom as `@/lib/horizon/queries/income`.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { Obligation, ObligationSchedule } from '../spending/types';
import {
  toObligation,
  toObligationSchedule,
  type HorizonObligationRow,
  type HorizonObligationScheduleRow,
} from '../spending/mappers';

const OBLIGATION_COLUMNS =
  'id, account_id, name, category, amount_minor, currency, recurrence, confidence, start_date, end_date, sort_order, archived';

const SCHEDULE_COLUMNS =
  'id, obligation_id, kind, day_of_month, interval_days, nth_weekday, weekday, anchor_date, slippage_policy, covers_period';

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
