/**
 * Domain types (camelCase) used by kapa-math, the API layer, and eventually
 * the UI. These are the app's model — distinct from the raw Supabase row types
 * (snake_case) generated into `supabase/database.types.ts` via `npm run gen:types`.
 * Rows are mapped to these at the data-access edge (see `mappers.ts`).
 *
 * All money is integer MINOR UNITS of the given currency (RSD has 0 decimals,
 * EUR/USD have 2). Use CURRENCY_EXPONENT for display formatting only — never
 * for arithmetic in kapa-math, which stays integer-based.
 */

export type Currency = "RSD" | "EUR" | "USD";

/** Minor units of some currency (integer). Branded to prevent mixing with plain numbers. */
export type Money = number & { readonly __brand: "MoneyMinor" };

export const CURRENCY_EXPONENT: Record<Currency, number> = {
  RSD: 0,
  EUR: 2,
  USD: 2,
};

export interface Profile {
  id: string;
  displayName: string | null;
  currency: Currency;
  timezone: string;
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
  evenPace: number;
  paceGap: number;
  projection: number;
  spentPct: number;
  categoryBreakdown: { categoryId: string | null; spent: number }[];
  otherCurrencies: CurrencyBucket[];
}
