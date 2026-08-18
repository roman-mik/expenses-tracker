/**
 * Domain-object factories for tests, promoted from the one-off `expense()`
 * helper in `category-breakdown.test.ts`. Every field has a sane default so a
 * test only needs to specify what it cares about.
 */
import type { Category, Expense, HouseholdMember } from '@/lib/types';
import type { LedgerAccount } from '@/lib/ledger/types';

export function expense(
  partial: Partial<Omit<Expense, 'amountMinor'>> & { amountMinor?: number } = {}
): Expense {
  return {
    id: 'expense-1',
    categoryId: null,
    amountMinor: 0,
    currency: 'RSD',
    note: null,
    spentAt: '2026-08-01T00:00:00.000Z',
    addedBy: 'user-1',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...partial,
  } as Expense;
}

export function category(partial: Partial<Category> = {}): Category {
  return {
    id: 'category-1',
    name: 'Groceries',
    color: 'sage-500',
    sortOrder: 0,
    archived: false,
    ...partial,
  };
}

export function member(
  partial: Partial<HouseholdMember> = {}
): HouseholdMember {
  return {
    userId: 'user-1',
    displayName: null,
    role: 'owner',
    ...partial,
  };
}

export function ledgerAccount(
  partial: Partial<Omit<LedgerAccount, 'currentBalanceMinor'>> & {
    currentBalanceMinor?: number;
  } = {}
): LedgerAccount {
  return {
    id: 'account-1',
    name: 'Checking',
    currency: 'RSD',
    currentBalanceMinor: 0 as LedgerAccount['currentBalanceMinor'],
    type: 'personal',
    includeInTotal: true,
    sortOrder: 0,
    archived: false,
    ...(partial as Partial<LedgerAccount>),
  };
}
