/**
 * Domain-object factories for tests, promoted from the one-off `expense()`
 * helper in `category-breakdown.test.ts`. Every field has a sane default so a
 * test only needs to specify what it cares about.
 */
import type { Category, Expense, HouseholdMember, Money } from '@/lib/types';
import type { HorizonAccount } from '@/lib/horizon/types';
import type { IncomeSchedule, IncomeStream } from '@/lib/horizon/income/types';
import type { ObligationSchedule } from '@/lib/horizon/spending/types';

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

export function horizonAccount(
  partial: Partial<Omit<HorizonAccount, 'currentBalanceMinor'>> & {
    currentBalanceMinor?: number;
  } = {}
): HorizonAccount {
  return {
    id: 'account-1',
    name: 'Checking',
    currency: 'RSD',
    currentBalanceMinor: 0 as HorizonAccount['currentBalanceMinor'],
    type: 'personal',
    includeInTotal: true,
    sortOrder: 0,
    archived: false,
    ...(partial as Partial<HorizonAccount>),
  };
}

export function incomeStream(
  partial: Partial<IncomeStream> = {}
): IncomeStream {
  return {
    id: 'stream-1',
    accountId: 'account-1',
    name: 'Freelance',
    currency: 'RSD',
    kind: 'hourly',
    hourlyRateMinor: 2000 as Money,
    hoursPerDay: 8,
    recurrence: 'recurring',
    confidence: 'confirmed',
    taxable: true,
    startDate: '2026-01-01',
    endDate: null,
    sortOrder: 0,
    archived: false,
    ...(partial as Partial<IncomeStream>),
  } as IncomeStream;
}

export function incomeSchedule(
  partial: Partial<IncomeSchedule> = {}
): IncomeSchedule {
  return {
    id: 'schedule-1',
    incomeStreamId: 'stream-1',
    kind: 'dayOfMonth',
    dayOfMonth: 15,
    intervalDays: null,
    nthWeekday: null,
    weekday: null,
    anchorDate: null,
    slippagePolicy: 'nextBusinessDay',
    coversPeriod: 'same',
    ...partial,
  };
}

export function obligationSchedule(
  partial: Partial<ObligationSchedule> = {}
): ObligationSchedule {
  return {
    id: 'obligation-schedule-1',
    obligationId: 'obligation-1',
    kind: 'dayOfMonth',
    dayOfMonth: 28,
    intervalDays: null,
    nthWeekday: null,
    weekday: null,
    anchorDate: null,
    slippagePolicy: 'nextBusinessDay',
    coversPeriod: 'same',
    ...partial,
  };
}
