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
  Obligation,
  ObligationCategory,
  ObligationSchedule,
} from './types';

type Tables = Database['public']['Tables'];
type Row<T extends keyof Tables> = Tables[T]['Row'];

export type HorizonObligationRow = Row<'horizon_obligations'>;
export type HorizonObligationScheduleRow = Row<'horizon_obligation_schedules'>;

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
