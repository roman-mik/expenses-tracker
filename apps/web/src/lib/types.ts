/**
 * Domain types (camelCase) used by kapa-math, the API layer, and eventually
 * the UI. These are the app's model — distinct from the raw Supabase row types
 * (snake_case) generated into `supabase/database.types.ts` via `npm run gen:types`.
 * Rows are mapped to these at the data-access edge (see `mappers.ts`).
 *
 * All money is integer MINOR UNITS of the given currency (RSD has 0 decimals,
 * EUR/USD/RUB have 2). Use CURRENCY_EXPONENT for display formatting only —
 * never for arithmetic in kapa-math, which stays integer-based.
 */

import type { Locale } from '@/i18n/routing';

/** Single source of truth for supported currencies — feeds the Zod enum and the UI picker. */
export const CURRENCIES = ['RSD', 'EUR', 'USD', 'RUB'] as const;

export type Currency = (typeof CURRENCIES)[number];

/** Minor units of some currency (integer). Branded to prevent mixing with plain numbers. */
export type Money = number & { readonly __brand: 'MoneyMinor' };

export const CURRENCY_EXPONENT: Record<Currency, number> = {
  RSD: 0,
  EUR: 2,
  USD: 2,
  RUB: 2,
};

export interface Profile {
  id: string;
  displayName: string | null;
  locale: Locale;
}

/** A household — the unit that owns the cap, categories and the expense pool. */
export interface Household {
  id: string;
  currency: Currency;
  timezone: string;
}

/** A member of a household, with their profile display name for attribution. */
export interface HouseholdMember {
  userId: string;
  displayName: string | null;
  role: 'owner' | 'member';
}

export interface Category {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  archived: boolean;
}

export interface BudgetSettings {
  monthlyCap: Money;
  nudgeEnabled: boolean;
  nudgePct: number;
}

export interface Expense {
  id: string;
  categoryId: string | null;
  amountMinor: Money;
  currency: Currency;
  note: string | null;
  spentAt: string; // ISO timestamp
  addedBy: string | null; // user_id of the member who logged it; null once that member's account is deleted (attribution.ts renders a neutral label)
  /** ISO timestamp, server-set on every write. The optimistic-concurrency
   * token: callers editing/deleting must present the value they last read,
   * or the write is rejected as a conflict (see mutations/expenses.ts). */
  updatedAt: string;
}

/** Per-currency spend bucket for currencies other than the profile's active one. */
export interface CurrencyBucket {
  currency: Currency;
  spent: Money;
}

/** The full home-screen payload returned by GET /api/summary. */
export interface Summary {
  currency: Currency;
  cap: number;
  spent: number;
  remaining: number;
  safeDaily: number;
  daysLeft: number;
  elapsedDays: number;
  /** Days fully completed before today — the pace baseline. See kapa-math.ts. */
  completedDays: number;
  evenPace: number;
  paceGap: number;
  projection: number;
  spentPct: number;
  /** How far past the cap this month is (0 while under or exactly at cap). */
  overspend: number;
  /** Household nudge settings, so the home screen can render the threshold banner. */
  nudgeEnabled: boolean;
  nudgePct: number;
  categoryBreakdown: { categoryId: string | null; spent: number }[];
  otherCurrencies: CurrencyBucket[];
}
