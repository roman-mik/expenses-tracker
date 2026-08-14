import { describe, it, expect } from 'vitest';
import { dailyTotals } from './date';
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

describe('dailyTotals', () => {
  it('zero-fills every day of the month, even with no expenses', () => {
    const result = dailyTotals([], '2026-04', 'UTC', 'RSD');
    expect(result).toHaveLength(30);
    expect(result[0]).toEqual({ dateKey: '2026-04-01', amountMinor: 0 });
    expect(result[29]).toEqual({ dateKey: '2026-04-30', amountMinor: 0 });
  });

  it('buckets by the zoned day, not the raw UTC date', () => {
    // 2026-08-01 23:30 Belgrade (UTC+2) is still Aug 1 local, but Aug 1 21:30 UTC.
    const result = dailyTotals(
      [expense({ spentAt: '2026-08-01T21:30:00.000Z', amountMinor: 500 })],
      '2026-08',
      'Europe/Belgrade',
      'RSD'
    );
    const aug1 = result.find((d) => d.dateKey === '2026-08-01');
    expect(aug1?.amountMinor).toBe(500);
  });

  it('excludes rows in a currency other than the household currency', () => {
    const result = dailyTotals(
      [
        expense({
          spentAt: '2026-08-05T10:00:00.000Z',
          amountMinor: 1000,
          currency: 'RSD',
        }),
        expense({
          spentAt: '2026-08-05T10:00:00.000Z',
          amountMinor: 5000,
          currency: 'EUR',
        }),
      ],
      '2026-08',
      'UTC',
      'RSD'
    );
    const aug5 = result.find((d) => d.dateKey === '2026-08-05');
    expect(aug5?.amountMinor).toBe(1000);
  });

  it('sums multiple expenses on the same day', () => {
    const result = dailyTotals(
      [
        expense({ spentAt: '2026-08-10T08:00:00.000Z', amountMinor: 300 }),
        expense({ spentAt: '2026-08-10T18:00:00.000Z', amountMinor: 200 }),
      ],
      '2026-08',
      'UTC',
      'RSD'
    );
    const aug10 = result.find((d) => d.dateKey === '2026-08-10');
    expect(aug10?.amountMinor).toBe(500);
  });
});
