/**
 * Row -> domain mappers for Horizon income, same idiom as `@/lib/horizon/mappers`.
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
  Holiday,
  IncomeSchedule,
  IncomeStream,
  IncomeStreamKind,
  WorkCalendar,
} from './types';

type Tables = Database['public']['Tables'];
type Row<T extends keyof Tables> = Tables[T]['Row'];

export type HorizonIncomeStreamRow = Row<'horizon_income_streams'>;
export type HorizonIncomeScheduleRow = Row<'horizon_income_schedules'>;
export type HorizonWorkCalendarRow = Row<'horizon_work_calendars'>;
export type HorizonHolidayRow = Row<'horizon_holidays'>;

const money = (n: number): Money => n as Money;

export function toIncomeStream(row: HorizonIncomeStreamRow): IncomeStream {
  const base = {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    currency: row.currency as Currency,
    recurrence: row.recurrence as Recurrence,
    confidence: row.confidence as Confidence,
    taxable: row.taxable,
    startDate: row.start_date,
    endDate: row.end_date,
    sortOrder: row.sort_order,
    archived: row.archived,
  };

  if ((row.kind as IncomeStreamKind) === 'hourly') {
    return {
      ...base,
      kind: 'hourly',
      // Both fields are guaranteed non-null for kind='hourly' by
      // horizon_income_streams_hourly_fields.
      hourlyRateMinor: money(row.hourly_rate_minor!),
      hoursPerDay: row.hours_per_day_e2! / 100,
    };
  }

  return {
    ...base,
    kind: row.kind as 'fixed' | 'variable',
    fixedAmountMinor: money(row.fixed_amount_minor!),
  };
}

export function toIncomeSchedule(
  row: HorizonIncomeScheduleRow
): IncomeSchedule {
  return {
    id: row.id,
    incomeStreamId: row.income_stream_id,
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

export function toWorkCalendar(row: HorizonWorkCalendarRow): WorkCalendar {
  return { workingWeekdays: row.working_weekdays };
}

export function toHoliday(row: HorizonHolidayRow): Holiday {
  return { id: row.id, date: row.date, name: row.name };
}
