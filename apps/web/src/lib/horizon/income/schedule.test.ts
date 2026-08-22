import { describe, it, expect } from 'vitest';
import {
  applySlippage,
  generateDates,
  isWorkingDay,
  nextDatesForSchedules,
  nextSixDates,
  type ScheduleCalendar,
} from './schedule';
import type { IncomeSchedule } from './types';

const monFri: ScheduleCalendar = {
  workingWeekdays: [1, 2, 3, 4, 5],
  holidays: [],
};

function schedule(overrides: Partial<IncomeSchedule>): IncomeSchedule {
  return {
    id: 'sc1',
    incomeStreamId: 's1',
    kind: 'dayOfMonth',
    dayOfMonth: null,
    intervalDays: null,
    nthWeekday: null,
    weekday: null,
    anchorDate: null,
    slippagePolicy: 'nextBusinessDay',
    coversPeriod: 'same',
    ...overrides,
  };
}

describe('generateDates', () => {
  it('dayOfMonth: fires on the given day each month in range', () => {
    const dates = generateDates(
      schedule({ kind: 'dayOfMonth', dayOfMonth: 15 }),
      monFri,
      { from: '2026-01-01', to: '2026-03-31' }
    );
    expect(dates).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
  });

  it('dayOfMonth: clamps into a shorter month instead of skipping it', () => {
    const dates = generateDates(
      schedule({ kind: 'dayOfMonth', dayOfMonth: 31 }),
      monFri,
      { from: '2026-01-01', to: '2026-02-28' }
    );
    // February 2026 has 28 days; 31 clamps to the 28th, not a skip.
    expect(dates).toEqual(['2026-01-31', '2026-02-28']);
  });

  it('monthEnd: lands on the actual last day, including a leap February', () => {
    const dates = generateDates(schedule({ kind: 'monthEnd' }), monFri, {
      from: '2028-01-01',
      to: '2028-04-30',
    });
    // 2028 is a leap year.
    expect(dates).toEqual([
      '2028-01-31',
      '2028-02-29',
      '2028-03-31',
      '2028-04-30',
    ]);
  });

  it('everyNDays: steps from the anchor, fast-forwarding an anchor before the range', () => {
    const dates = generateDates(
      schedule({
        kind: 'everyNDays',
        intervalDays: 14,
        anchorDate: '2026-01-01',
      }),
      monFri,
      { from: '2026-02-01', to: '2026-03-01' }
    );
    // Anchor + 14*3 = 2026-02-12, + 14*4 = 2026-02-26, + 14*5 = 2026-03-12
    // (past `to`).
    expect(dates).toEqual(['2026-02-12', '2026-02-26']);
  });

  it('everyNDays: includes the anchor itself when inside the range', () => {
    const dates = generateDates(
      schedule({
        kind: 'everyNDays',
        intervalDays: 7,
        anchorDate: '2026-01-05',
      }),
      monFri,
      { from: '2026-01-01', to: '2026-01-19' }
    );
    expect(dates).toEqual(['2026-01-05', '2026-01-12', '2026-01-19']);
  });

  it('nthWeekday: the 3rd Friday of each month', () => {
    const dates = generateDates(
      schedule({ kind: 'nthWeekday', nthWeekday: 3, weekday: 5 }),
      monFri,
      { from: '2026-01-01', to: '2026-02-28' }
    );
    expect(dates).toEqual(['2026-01-16', '2026-02-20']);
  });

  it('nthWeekday: skips a month with no 5th occurrence rather than erroring', () => {
    // January 2026 has only four Fridays (2, 9, 16, 23, 30 -> actually five;
    // pick a month/weekday pair with genuinely four occurrences: February
    // 2026 has four Sundays (1, 8, 15, 22) and no 5th.
    const dates = generateDates(
      schedule({ kind: 'nthWeekday', nthWeekday: 5, weekday: 0 }),
      monFri,
      { from: '2026-02-01', to: '2026-02-28' }
    );
    expect(dates).toEqual([]);
  });

  it('oneOff: fires exactly once, only if the anchor is inside the range', () => {
    const inRange = generateDates(
      schedule({ kind: 'oneOff', anchorDate: '2026-06-15' }),
      monFri,
      { from: '2026-01-01', to: '2026-12-31' }
    );
    expect(inRange).toEqual(['2026-06-15']);

    const outOfRange = generateDates(
      schedule({ kind: 'oneOff', anchorDate: '2027-01-01' }),
      monFri,
      { from: '2026-01-01', to: '2026-12-31' }
    );
    expect(outOfRange).toEqual([]);
  });

  it('returns nothing for an inverted range', () => {
    const dates = generateDates(schedule({ kind: 'monthEnd' }), monFri, {
      from: '2026-03-01',
      to: '2026-01-01',
    });
    expect(dates).toEqual([]);
  });
});

describe('isWorkingDay', () => {
  it('is false on a non-working weekday', () => {
    // 2026-01-03 is a Saturday.
    expect(isWorkingDay('2026-01-03', monFri)).toBe(false);
  });

  it('is false on a stored holiday even if the weekday is a working day', () => {
    const withHoliday: ScheduleCalendar = {
      ...monFri,
      holidays: ['2026-01-01'],
    };
    expect(isWorkingDay('2026-01-01', withHoliday)).toBe(false);
  });

  it('is true on an ordinary working weekday', () => {
    // 2026-01-05 is a Monday.
    expect(isWorkingDay('2026-01-05', monFri)).toBe(true);
  });
});

describe('applySlippage', () => {
  it("'none' never shifts, even off a working day", () => {
    expect(applySlippage('2026-01-03', monFri, 'none')).toBe('2026-01-03');
  });

  it('nextBusinessDay walks forward over a weekend', () => {
    // 2026-01-03 is Saturday -> next working day is Monday 2026-01-05.
    expect(applySlippage('2026-01-03', monFri, 'nextBusinessDay')).toBe(
      '2026-01-05'
    );
  });

  it('prevBusinessDay walks backward over a weekend', () => {
    // 2026-01-04 is Sunday -> previous working day is Friday 2026-01-02.
    expect(applySlippage('2026-01-04', monFri, 'prevBusinessDay')).toBe(
      '2026-01-02'
    );
  });

  it('shifts over a holiday landing on an otherwise-working day', () => {
    const withHoliday: ScheduleCalendar = {
      ...monFri,
      holidays: ['2026-01-05'],
    };
    expect(applySlippage('2026-01-05', withHoliday, 'nextBusinessDay')).toBe(
      '2026-01-06'
    );
  });

  it('is a no-op when the date is already a working day', () => {
    expect(applySlippage('2026-01-05', monFri, 'nextBusinessDay')).toBe(
      '2026-01-05'
    );
  });
});

describe('nextSixDates', () => {
  it('flags a shifted date and preserves the original', () => {
    const sc = schedule({
      kind: 'dayOfMonth',
      dayOfMonth: 3,
      slippagePolicy: 'nextBusinessDay',
    });
    // 2026-01-03 is a Saturday.
    const [first] = nextSixDates(sc, monFri, '2026-01-01');
    expect(first).toEqual({
      date: '2026-01-05',
      shifted: true,
      originalDate: '2026-01-03',
    });
  });

  it('returns up to six occurrences, unshifted when already working days', () => {
    const sc = schedule({ kind: 'monthEnd', slippagePolicy: 'none' });
    const dates = nextSixDates(sc, monFri, '2026-01-01');
    expect(dates).toHaveLength(6);
    expect(dates.every((d) => !d.shifted)).toBe(true);
  });
});

describe('nextDatesForSchedules', () => {
  it('merges and sorts occurrences across multiple schedules on a stream', () => {
    const fifteenth = schedule({
      id: 'sc-15',
      kind: 'dayOfMonth',
      dayOfMonth: 15,
      slippagePolicy: 'none',
    });
    const monthEnd = schedule({
      id: 'sc-end',
      kind: 'monthEnd',
      slippagePolicy: 'none',
    });

    const merged = nextDatesForSchedules(
      [fifteenth, monthEnd],
      monFri,
      '2026-01-01',
      4
    );
    expect(merged.map((m) => m.date)).toEqual([
      '2026-01-15',
      '2026-01-31',
      '2026-02-15',
      '2026-02-28',
    ]);
    expect(merged.map((m) => m.scheduleId)).toEqual([
      'sc-15',
      'sc-end',
      'sc-15',
      'sc-end',
    ]);
  });
});
