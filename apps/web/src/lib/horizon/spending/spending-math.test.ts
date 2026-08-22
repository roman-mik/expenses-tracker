import { describe, it, expect } from 'vitest';
import {
  categoryShares,
  chargeAmount,
  chargeDates,
  dailyExpenseForMonth,
  monthLengthVariants,
  monthlyObligationTotal,
} from './spending-math';
import type { ScheduleCalendar } from '@/lib/horizon/schedule';
import type { FxRate } from '@/lib/horizon/types';
import { obligationSchedule } from '@/test/factories';

const monFri: ScheduleCalendar = {
  workingWeekdays: [1, 2, 3, 4, 5],
  holidays: [],
};

describe('monthlyObligationTotal', () => {
  it('multiplies the per-occurrence amount by occurrences actually in the month', () => {
    const schedules = [
      obligationSchedule({ kind: 'dayOfMonth', dayOfMonth: 15 }),
    ];
    expect(monthlyObligationTotal(50000, schedules, '2026-01', monFri)).toBe(
      50000
    );
  });

  it('a twice-monthly obligation is never treated as once/month', () => {
    const schedules = [
      obligationSchedule({ id: 'sc-a', kind: 'dayOfMonth', dayOfMonth: 1 }),
      obligationSchedule({ id: 'sc-b', kind: 'monthEnd' }),
    ];
    expect(monthlyObligationTotal(50000, schedules, '2026-01', monFri)).toBe(
      100000
    );
  });

  it('contributes zero in a month the schedule does not fire', () => {
    const schedules = [
      obligationSchedule({
        kind: 'everyNDays',
        intervalDays: 90,
        anchorDate: '2026-01-15',
      }),
    ];
    expect(monthlyObligationTotal(50000, schedules, '2026-02', monFri)).toBe(0);
  });
});

describe('dailyExpenseForMonth', () => {
  it('multiplies by calendar days, not working days', () => {
    // January has 31 calendar days regardless of weekends.
    expect(dailyExpenseForMonth(1000, '2026-01')).toBe(31000);
  });

  it('handles February in a non-leap year', () => {
    expect(dailyExpenseForMonth(1000, '2026-02')).toBe(28000);
  });
});

describe('monthLengthVariants', () => {
  it('returns the 28/30/31-day totals', () => {
    expect(monthLengthVariants(1000)).toEqual({
      d28: 28000,
      d30: 30000,
      d31: 31000,
    });
  });
});

describe('chargeDates', () => {
  it('daily cadence posts every calendar day in range', () => {
    const dates = chargeDates(
      { startDate: '2026-01-01', chargeCadence: 'daily' },
      { from: '2026-01-01', to: '2026-01-03' }
    );
    expect(dates).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });

  it('weekly cadence posts every 7th day from the anchor', () => {
    const dates = chargeDates(
      { startDate: '2026-01-01', chargeCadence: 'weekly' },
      { from: '2026-01-01', to: '2026-01-22' }
    );
    expect(dates).toEqual([
      '2026-01-01',
      '2026-01-08',
      '2026-01-15',
      '2026-01-22',
    ]);
  });

  it('weekly cadence fast-forwards the anchor into a later range', () => {
    const dates = chargeDates(
      { startDate: '2026-01-01', chargeCadence: 'weekly' },
      { from: '2026-02-01', to: '2026-02-28' }
    );
    // 2026-01-01 is a Thursday; the next Thursdays in Feb are 5,12,19,26.
    expect(dates).toEqual([
      '2026-02-05',
      '2026-02-12',
      '2026-02-19',
      '2026-02-26',
    ]);
  });

  it('monthly cadence posts on the anchor day of month, clamped to shorter months', () => {
    const dates = chargeDates(
      { startDate: '2026-01-31', chargeCadence: 'monthly' },
      { from: '2026-01-01', to: '2026-03-31' }
    );
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });
});

describe('chargeAmount', () => {
  it('daily: one day of accrual', () => {
    expect(chargeAmount(1000, 'daily', 30)).toBe(1000);
  });

  it('weekly: seven days of accrual per charge', () => {
    expect(chargeAmount(1000, 'weekly', 30)).toBe(7000);
  });

  it('monthly: the full period length', () => {
    expect(chargeAmount(1000, 'monthly', 30)).toBe(30000);
  });
});

describe('categoryShares', () => {
  const rate: FxRate = {
    baseCode: 'EUR',
    quoteCode: 'RSD',
    rateE8: 117_000_000,
    asOfDate: '2026-01-01',
    source: 'test',
  };

  it('shares sum to 100%', () => {
    const rows = [
      { category: 'housing', amountMinor: 50000, currency: 'RSD' as const },
      { category: 'utilities', amountMinor: 50000, currency: 'RSD' as const },
    ];
    const shares = categoryShares(rows, 'RSD', [], '2026-01-31');
    const total = shares.reduce((s, r) => s + r.sharePct, 0);
    expect(total).toBeCloseTo(100, 6);
  });

  it('converts a foreign-currency row via fx.ts before summing', () => {
    const rows = [
      { category: 'debt', amountMinor: 10000, currency: 'EUR' as const },
    ];
    const shares = categoryShares(rows, 'RSD', [rate], '2026-01-31');
    // 10000 EUR minor (= 100.00 EUR) x 1.17 = 117 RSD minor (RSD has 0 decimals).
    expect(shares[0].totalMinor).toBe(117);
    expect(shares[0].hasMissingRate).toBe(false);
  });

  it('a row with no usable rate is excluded from the total and flagged, never thrown', () => {
    const rows = [
      { category: 'debt', amountMinor: 10000, currency: 'EUR' as const },
      { category: 'housing', amountMinor: 50000, currency: 'RSD' as const },
    ];
    const shares = categoryShares(rows, 'RSD', [], '2026-01-31');
    const debt = shares.find((s) => s.category === 'debt')!;
    const housing = shares.find((s) => s.category === 'housing')!;
    expect(debt.hasMissingRate).toBe(true);
    expect(debt.totalMinor).toBe(0);
    expect(housing.sharePct).toBe(100);
  });
});
