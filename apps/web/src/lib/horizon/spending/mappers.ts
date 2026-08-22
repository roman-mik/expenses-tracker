/**
 * Row -> domain mappers for Horizon obligations, same idiom as
 * `@/lib/horizon/income/mappers`.
 */
import type { Currency, Money } from '@/lib/types';
import type { Database } from '@/lib/supabase/database.types';
import type {
  Confidence,
  CoversPeriod,
  Recurrence,
  ScheduleKind,
  SlippagePolicy,
} from '@/lib/horizon/types';
import type {
  ChargeCadence,
  DailyExpense,
  Obligation,
  ObligationCategory,
  ObligationSchedule,
  OneOffCategory,
  OneOffDirection,
  OneOffEvent,
} from './types';

type Tables = Database['public']['Tables'];
type Row<T extends keyof Tables> = Tables[T]['Row'];

export type HorizonObligationRow = Row<'horizon_obligations'>;
export type HorizonObligationScheduleRow = Row<'horizon_obligation_schedules'>;
export type HorizonDailyExpenseRow = Row<'horizon_daily_expenses'>;
export type HorizonOneOffEventRow = Row<'horizon_one_off_events'>;

const money = (n: number): Money => n as Money;

export function toObligation(row: HorizonObligationRow): Obligation {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    category: row.category as ObligationCategory,
    amountMinor: money(row.amount_minor),
    currency: row.currency as Currency,
    recurrence: row.recurrence as Recurrence,
    confidence: row.confidence as Confidence,
    startDate: row.start_date,
    endDate: row.end_date,
    sortOrder: row.sort_order,
    archived: row.archived,
  };
}

export function toObligationSchedule(
  row: HorizonObligationScheduleRow
): ObligationSchedule {
  return {
    id: row.id,
    obligationId: row.obligation_id,
    kind: row.kind as ScheduleKind,
    dayOfMonth: row.day_of_month,
    intervalDays: row.interval_days,
    nthWeekday: row.nth_weekday,
    weekday: row.weekday,
    anchorDate: row.anchor_date,
    slippagePolicy: row.slippage_policy as SlippagePolicy,
    coversPeriod: row.covers_period as CoversPeriod,
  };
}

export function toDailyExpense(row: HorizonDailyExpenseRow): DailyExpense {
  return {
    id: row.id,
    accountId: row.account_id,
    pocketCategoryId: row.pocket_category_id,
    name: row.name,
    dailyAmountMinor: money(row.daily_amount_minor),
    currency: row.currency as Currency,
    chargeCadence: row.charge_cadence as ChargeCadence,
    capMinor: row.cap_minor === null ? null : money(row.cap_minor),
    startDate: row.start_date,
    endDate: row.end_date,
    archived: row.archived,
  };
}

export function toOneOffEvent(row: HorizonOneOffEventRow): OneOffEvent {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    category: row.category as OneOffCategory,
    amountMinor: money(row.amount_minor),
    currency: row.currency as Currency,
    date: row.date,
    direction: row.direction as OneOffDirection,
  };
}
