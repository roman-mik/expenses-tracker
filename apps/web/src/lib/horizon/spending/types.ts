/**
 * Horizon Epic C domain types (camelCase), same idiom as
 * `@/lib/horizon/income/types`. An obligation can have multiple schedules
 * (e.g. "half on the 1st, half on the 15th"), so `ObligationSchedule` is its
 * own entity, not embedded fields on `Obligation`.
 */
import type { Currency, Money } from '@/lib/types';
import type {
  Confidence,
  CoversPeriod,
  Recurrence,
  ScheduleKind,
  SlippagePolicy,
} from '@/lib/horizon/types';

export const OBLIGATION_CATEGORIES = [
  'housing',
  'utilities',
  'debt',
  'subscriptions',
  'insurance',
  'transport',
  'family',
  'other',
] as const;
export type ObligationCategory = (typeof OBLIGATION_CATEGORIES)[number];

export interface Obligation {
  id: string;
  accountId: string;
  name: string;
  category: ObligationCategory;
  /** Per occurrence, never a monthly total (D1). */
  amountMinor: Money;
  currency: Currency;
  recurrence: Recurrence;
  confidence: Confidence;
  /** `YYYY-MM-DD`. */
  startDate: string;
  /** `YYYY-MM-DD`, inclusive. */
  endDate: string | null;
  sortOrder: number;
  archived: boolean;
}

export interface ObligationSchedule {
  id: string;
  obligationId: string;
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

export const CHARGE_CADENCES = ['daily', 'weekly', 'monthly'] as const;
export type ChargeCadence = (typeof CHARGE_CADENCES)[number];

export interface DailyExpense {
  id: string;
  accountId: string;
  /** The Pocket category this budget's actuals are matched against, if any. */
  pocketCategoryId: string | null;
  name: string;
  /** Per-day accrual rate, never a monthly total (D1). */
  dailyAmountMinor: Money;
  currency: Currency;
  chargeCadence: ChargeCadence;
  /** Monthly spending cap for the tracker, or null if uncapped. */
  capMinor: Money | null;
  /** `YYYY-MM-DD`; also the anchor for weekly charges. */
  startDate: string;
  /** `YYYY-MM-DD`, inclusive. */
  endDate: string | null;
  archived: boolean;
}

export const ONE_OFF_CATEGORIES = [
  'housing',
  'utilities',
  'debt',
  'subscriptions',
  'insurance',
  'transport',
  'family',
  'gift',
  'bonus',
  'other',
] as const;
export type OneOffCategory = (typeof ONE_OFF_CATEGORIES)[number];

export const ONE_OFF_DIRECTIONS = ['in', 'out'] as const;
export type OneOffDirection = (typeof ONE_OFF_DIRECTIONS)[number];

export interface OneOffEvent {
  id: string;
  accountId: string;
  name: string;
  category: OneOffCategory;
  amountMinor: Money;
  currency: Currency;
  /** `YYYY-MM-DD`. */
  date: string;
  direction: OneOffDirection;
}
