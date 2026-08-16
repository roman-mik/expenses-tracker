import { describe, it, expect } from 'vitest';
import { categoryBreakdown } from './category-breakdown';
import type { Expense } from './types';

function expense(
  partial: Partial<Omit<Expense, 'amountMinor'>> & { amountMinor?: number }
): Expense {
  return {
    id: 'x',
    categoryId: null,
    amountMinor: 0,
    currency: 'RSD',
    note: null,
    spentAt: '2026-08-01T00:00:00.000Z',
    addedBy: 'u1',
    ...partial,
  } as Expense;
}

describe('categoryBreakdown', () => {
  it('sums amounts per category, uncategorized under a null key', () => {
    const result = categoryBreakdown(
      [
        expense({ categoryId: 'groceries', amountMinor: 1000 }),
        expense({ categoryId: 'groceries', amountMinor: 500 }),
        expense({ categoryId: null, amountMinor: 200 }),
      ],
      'RSD'
    );
    expect(result).toEqual([
      { categoryId: 'groceries', spent: 1500 },
      { categoryId: null, spent: 200 },
    ]);
  });

  it('excludes rows in a currency other than the household currency', () => {
    const result = categoryBreakdown(
      [
        expense({ categoryId: 'fun', amountMinor: 1000, currency: 'RSD' }),
        expense({ categoryId: 'fun', amountMinor: 5000, currency: 'EUR' }),
      ],
      'RSD'
    );
    expect(result).toEqual([{ categoryId: 'fun', spent: 1000 }]);
  });

  it('sorts descending by spend', () => {
    const result = categoryBreakdown(
      [
        expense({ categoryId: 'a', amountMinor: 100 }),
        expense({ categoryId: 'b', amountMinor: 300 }),
        expense({ categoryId: 'c', amountMinor: 200 }),
      ],
      'RSD'
    );
    expect(result.map((r) => r.categoryId)).toEqual(['b', 'c', 'a']);
  });

  it('returns an empty array for no matching expenses', () => {
    expect(categoryBreakdown([], 'RSD')).toEqual([]);
  });
});
