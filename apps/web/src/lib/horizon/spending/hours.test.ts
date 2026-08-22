import { describe, it, expect } from 'vitest';
import {
  availableWorkingHours,
  blendedHourlyRate,
  obligationCostInHours,
} from './hours';
import type { ScheduleCalendar } from '@/lib/horizon/schedule';
import type { FxRate } from '@/lib/horizon/types';
import type { IncomeStream } from '@/lib/horizon/income/types';

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

const eurToRsd: FxRate = {
  baseCode: 'EUR',
  quoteCode: 'RSD',
  rateE8: 117_000_000,
  asOfDate: '2026-01-01',
  source: 'test',
};

describe('blendedHourlyRate', () => {
  it('blends two hourly streams in the same currency', () => {
    // 22 working days in Jan 2026 (Mon-Fri).
    const streams = [
      hourlyStream({
        id: 's-a',
        hourlyRateMinor: 4000 as never,
        hoursPerDay: 8,
      }),
      hourlyStream({
        id: 's-b',
        hourlyRateMinor: 6000 as never,
        hoursPerDay: 8,
      }),
    ];
    const blended = blendedHourlyRate(streams, monFri, '2026-01', 'RSD', []);
    // total income = (4000+6000)*8*22, total hours = 2*8*22 -> blended = 5000.
    expect(blended).toBe(5000);
  });

  it('blends across currencies via fx.ts', () => {
    const streams = [
      hourlyStream({
        id: 's-a',
        currency: 'RSD',
        hourlyRateMinor: 5000 as never,
      }),
      hourlyStream({
        id: 's-b',
        currency: 'EUR',
        hourlyRateMinor: 10 as never,
      }),
    ];
    const blended = blendedHourlyRate(streams, monFri, '2026-01', 'RSD', [
      eurToRsd,
    ]);
    expect(blended).not.toBeNull();
    expect(blended).toBeGreaterThan(0);
  });

  it('returns null when a needed FX rate is missing', () => {
    const streams = [hourlyStream({ currency: 'EUR' })];
    expect(blendedHourlyRate(streams, monFri, '2026-01', 'RSD', [])).toBeNull();
  });

  it('excludes archived and one-off streams', () => {
    const streams = [
      hourlyStream({ id: 's-a', archived: true }),
      hourlyStream({ id: 's-b', recurrence: 'oneOff' }),
    ];
    expect(blendedHourlyRate(streams, monFri, '2026-01', 'RSD', [])).toBeNull();
  });
});

describe('obligationCostInHours', () => {
  it('divides amount by the blended rate', () => {
    expect(
      obligationCostInHours(50000, 'RSD', 5000, 'RSD', [], '2026-01-31')
    ).toBe(10);
  });

  it('converts currency first, via fx.ts', () => {
    const hours = obligationCostInHours(
      100,
      'EUR',
      5000,
      'RSD',
      [eurToRsd],
      '2026-01-31'
    );
    expect(hours).not.toBeNull();
    expect(hours).toBeGreaterThan(0);
  });

  it('returns null when the blended rate is missing or zero', () => {
    expect(
      obligationCostInHours(50000, 'RSD', null, 'RSD', [], '2026-01-31')
    ).toBeNull();
    expect(
      obligationCostInHours(50000, 'RSD', 0, 'RSD', [], '2026-01-31')
    ).toBeNull();
  });

  it('returns null when a needed FX rate is missing', () => {
    expect(
      obligationCostInHours(100, 'EUR', 5000, 'RSD', [], '2026-01-31')
    ).toBeNull();
  });
});

describe('availableWorkingHours', () => {
  it('sums hoursPerDay x workingDaysInMonth across active hourly streams', () => {
    const streams = [
      hourlyStream({ id: 's-a', hoursPerDay: 8 }),
      hourlyStream({ id: 's-b', hoursPerDay: 4 }),
    ];
    // 22 working days in Jan 2026.
    expect(availableWorkingHours(streams, monFri, '2026-01')).toBe(
      (8 + 4) * 22
    );
  });

  it('the over-available-hours condition is detectable by comparing against obligation hours', () => {
    const streams = [hourlyStream({ hoursPerDay: 1 })];
    const available = availableWorkingHours(streams, monFri, '2026-01');
    const obligationHours = obligationCostInHours(
      500000,
      'RSD',
      5000,
      'RSD',
      [],
      '2026-01-31'
    )!;
    expect(obligationHours).toBeGreaterThan(available);
  });
});
