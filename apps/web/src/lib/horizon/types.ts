/**
 * Horizon domain types (camelCase), same idiom as `@/lib/types` — the Pocket
 * model and the Horizon model stay separate types even where a table (like
 * `households`) is shared, so a Horizon read never implies a Pocket contract.
 *
 * Money is integer minor units, same discipline as Pocket (see `@/lib/types`).
 */
import type { Currency, Money } from '@/lib/types';

/** Single source of truth for account types — feeds the Zod enum and the UI picker. */
export const ACCOUNT_TYPES = ['business', 'personal', 'savings'] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

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

export interface HorizonAccount {
  id: string;
  name: string;
  currency: Currency;
  /** MAY be negative (overdraft) — no DB check constraint on sign. */
  currentBalanceMinor: Money;
  type: AccountType;
  includeInTotal: boolean;
  sortOrder: number;
  archived: boolean;
}

/** Household-level horizon settings — currently just the reporting currency. */
export interface HorizonSettings {
  reportingCurrency: Currency;
}

/**
 * A single dated FX snapshot: `1 baseCode = rateE8 / 1e8 quoteCode`. Global
 * reference data (not household-scoped) — see 0015_horizon_fx_rates.sql.
 * `asOfDate` is `YYYY-MM-DD`, comparable lexicographically.
 */
export interface FxRate {
  baseCode: Currency;
  quoteCode: Currency;
  rateE8: number;
  asOfDate: string;
  source: string;
}

/**
 * A historical snapshot of an account's balance recorded during reconciliation (A4).
 * `varianceMinor` is derived: `balanceMinor - expectedMinor`.
 */
export interface HorizonBalanceSnapshot {
  id: string;
  householdId: string;
  accountId: string;
  balanceMinor: Money;
  expectedMinor: Money;
  varianceMinor: Money;
  currency: Currency;
  recordedAt: string;
  note: string | null;
}
