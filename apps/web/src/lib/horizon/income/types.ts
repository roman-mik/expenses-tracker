/**
 * Horizon Epic B domain types (camelCase), same idiom as `@/lib/horizon/types`.
 * A stream can have multiple schedules (e.g. "the 15th and month end"), so
 * `IncomeSchedule` is its own entity, not embedded fields on `IncomeStream`.
 */
import type { Currency, Money } from '@/lib/types';

export type IncomeStreamKind = 'hourly' | 'fixed' | 'variable';

export const RECURRENCE_VALUES = ['recurring', 'oneOff'] as const;
export type Recurrence = (typeof RECURRENCE_VALUES)[number];

export const CONFIDENCE_VALUES = [
  'confirmed',
  'expected',
  'uncertain',
] as const;
export type Confidence = (typeof CONFIDENCE_VALUES)[number];

export type ScheduleKind =
  'dayOfMonth' | 'monthEnd' | 'everyNDays' | 'nthWeekday' | 'oneOff';

export const SLIPPAGE_POLICIES = [
  'nextBusinessDay',
  'prevBusinessDay',
  'none',
] as const;
export type SlippagePolicy = (typeof SLIPPAGE_POLICIES)[number];

export const COVERS_PERIOD_VALUES = ['same', 'next', 'previous'] as const;
export type CoversPeriod = (typeof COVERS_PERIOD_VALUES)[number];

interface IncomeStreamBase {
  id: string;
  accountId: string;
  name: string;
  currency: Currency;
  recurrence: Recurrence;
  confidence: Confidence;
  taxable: boolean;
  /** `YYYY-MM-DD`. */
  startDate: string;
  /** `YYYY-MM-DD`, inclusive. */
  endDate: string | null;
  sortOrder: number;
  archived: boolean;
}

interface HourlyIncomeStream extends IncomeStreamBase {
  kind: 'hourly';
  hourlyRateMinor: Money;
  /** Hours per working day, as a decimal (e.g. 7.5). */
  hoursPerDay: number;
}

interface FlatIncomeStream extends IncomeStreamBase {
  kind: 'fixed' | 'variable';
  fixedAmountMinor: Money;
}

export type IncomeStream = HourlyIncomeStream | FlatIncomeStream;

export interface IncomeSchedule {
  id: string;
  incomeStreamId: string;
  kind: ScheduleKind;
  /** kind = dayOfMonth. 1-31, clamped to the month's actual length. */
  dayOfMonth: number | null;
  /** kind = everyNDays. */
  intervalDays: number | null;
  /** kind = nthWeekday. 1st..5th occurrence. */
  nthWeekday: number | null;
  /** kind = nthWeekday. 0=Sun..6=Sat. */
  weekday: number | null;
  /** kind = everyNDays | oneOff. `YYYY-MM-DD`. */
  anchorDate: string | null;
  slippagePolicy: SlippagePolicy;
  coversPeriod: CoversPeriod;
}

export interface WorkCalendar {
  /** 0=Sun..6=Sat. */
  workingWeekdays: number[];
}

export interface Holiday {
  id: string;
  /** `YYYY-MM-DD`. */
  date: string;
  name: string;
}
