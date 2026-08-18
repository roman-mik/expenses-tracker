/**
 * Ledger domain types (camelCase), same idiom as `@/lib/types` — the Kapa
 * model and the Ledger model stay separate types even where a table (like
 * `households`) is shared, so a Ledger read never implies a Kapa contract.
 *
 * Money is integer minor units, same discipline as Kapa (see `@/lib/types`).
 */
import type { Currency, Money } from '@/lib/types';

/** Single source of truth for account types — feeds the Zod enum and the UI picker. */
export const ACCOUNT_TYPES = ['business', 'personal', 'savings'] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export interface LedgerAccount {
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

/** Household-level ledger settings — currently just the reporting currency. */
export interface LedgerSettings {
  reportingCurrency: Currency;
}
