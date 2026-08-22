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
