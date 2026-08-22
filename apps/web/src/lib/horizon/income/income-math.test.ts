import { describe, it, expect } from 'vitest';
import {
  annualizedIncome,
  hourlyIncomeForPeriod,
  monthlyIncomeForStream,
  workingDaysInMonth,
} from './income-math';
import type { ScheduleCalendar } from './schedule';
import type { IncomeSchedule, IncomeStream } from './types';

const monFri: ScheduleCalendar = {
  workingWeekdays: [1, 2, 3, 4, 5],
  holidays: [],
};

function hourlyStream(overrides: Partial<IncomeStream> = {}): IncomeStream {
  return {
    id: 's1',
    accountId: 'a1',
    name: 'Freelance',
    currency: 'RSD',
    recurrence: 'recurring',
    confidence: 'confirmed',
    taxable: true,
    startDate: '2026-01-01',
    endDate: null,
    sortOrder: 0,
    archived: false,
    kind: 'hourly',
    hourlyRateMinor: 5000 as never,
    hoursPerDay: 8,
    ...overrides,
  } as IncomeStream;
}

function fixedStream(overrides: Partial<IncomeStream> = {}): IncomeStream {
  return {
    id: 's2',
    accountId: 'a1',
    name: 'Retainer',
    currency: 'RSD',
    recurrence: 'recurring',
    confidence: 'confirmed',
    taxable: true,
    startDate: '2026-01-01',
    endDate: null,
    sortOrder: 0,
    archived: false,
    kind: 'fixed',
    fixedAmountMinor: 100000 as never,
    ...overrides,
  } as IncomeStream;
}

function schedule(overrides: Partial<IncomeSchedule>): IncomeSchedule {
  return {
    id: 'sc1',
    incomeStreamId: 's2',
    kind: 'dayOfMonth',
    dayOfMonth: null,
    intervalDays: null,
    nthWeekday: null,
    weekday: null,
    anchorDate: null,
    slippagePolicy: 'none',
    coversPeriod: 'same',
    ...overrides,
  };
}

describe('hourlyIncomeForPeriod', () => {
  it('multiplies rate x hours x working days', () => {
    expect(hourlyIncomeForPeriod(5000, 8, 20)).toBe(800000);
  });

  it('rounds half-up on a fractional result', () => {
    // 3333 * 7.5 * 1 = 24997.5 -> rounds to 24998.
    expect(hourlyIncomeForPeriod(3333, 7.5, 1)).toBe(24998);
  });
});

describe('workingDaysInMonth', () => {
  it('counts weekdays only, ignoring holidays when there are none', () => {
    expect(workingDaysInMonth('2026-01', monFri)).toBe(22);
    expect(workingDaysInMonth('2026-02', monFri)).toBe(20);
  });

  it('a holiday landing on a weekday reduces the count by one', () => {
    const withHoliday: ScheduleCalendar = {
      ...monFri,
      holidays: ['2026-01-01'], // a Thursday
    };
    expect(workingDaysInMonth('2026-01', withHoliday)).toBe(21);
  });
});

describe('monthlyIncomeForStream', () => {
  it('an hourly stream derives from the calendar, independent of any schedule', () => {
    const stream = hourlyStream();
    expect(monthlyIncomeForStream(stream, [], '2026-01', monFri)).toBe(
      5000 * 8 * 22
    );
    // Fewer working days in February -> lower derived income, no manual edit.
    expect(monthlyIncomeForStream(stream, [], '2026-02', monFri)).toBe(
      5000 * 8 * 20
    );
  });

  it('a fixed stream sums once per matching schedule occurrence in the month', () => {
    const stream = fixedStream();
    const monthly = [schedule({ kind: 'dayOfMonth', dayOfMonth: 15 })];
    expect(monthlyIncomeForStream(stream, monthly, '2026-01', monFri)).toBe(
      100000
    );
  });

  it('a fixed stream with two schedules in one month sums both occurrences', () => {
    const stream = fixedStream();
    const twiceMonthly = [
      schedule({ id: 'sc-a', kind: 'dayOfMonth', dayOfMonth: 15 }),
      schedule({ id: 'sc-b', kind: 'monthEnd' }),
    ];
    expect(
      monthlyIncomeForStream(stream, twiceMonthly, '2026-01', monFri)
    ).toBe(200000);
  });

  it('a quarterly fixed stream contributes zero in a month it does not fire', () => {
    const stream = fixedStream();
    const quarterly = [
      schedule({
        kind: 'everyNDays',
        intervalDays: 90,
        anchorDate: '2026-01-15',
      }),
    ];
    expect(monthlyIncomeForStream(stream, quarterly, '2026-02', monFri)).toBe(
      0
    );
  });
});

describe('annualizedIncome', () => {
  it('excludes one-off streams by default', () => {
    const recurring = fixedStream({ id: 's-a' });
    const oneOff = fixedStream({ id: 's-b', recurrence: 'oneOff' });
    const schedules = [
      schedule({ id: 'sc-a', incomeStreamId: 's-a', kind: 'monthEnd' }),
      schedule({ id: 'sc-b', incomeStreamId: 's-b', kind: 'monthEnd' }),
    ];

    const withoutOneOff = annualizedIncome(
      [recurring, oneOff],
      schedules,
      monFri,
      2026
    );
    expect(withoutOneOff).toBe(100000 * 12);

    const withOneOff = annualizedIncome(
      [recurring, oneOff],
      schedules,
      monFri,
      2026,
      { includeOneOff: true }
    );
    expect(withOneOff).toBe(100000 * 12 * 2);
  });

  it('excludes archived streams regardless of the toggle', () => {
    const archived = fixedStream({ id: 's-c', archived: true });
    const schedules = [
      schedule({ id: 'sc-c', incomeStreamId: 's-c', kind: 'monthEnd' }),
    ];
    expect(
      annualizedIncome([archived], schedules, monFri, 2026, {
        includeOneOff: true,
      })
    ).toBe(0);
  });
});
