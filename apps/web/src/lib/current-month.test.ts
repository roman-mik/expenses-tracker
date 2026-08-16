import { describe, expect, it } from 'vitest';
import { currentMonth } from './kapa-math';

describe('currentMonth', () => {
  it('returns YYYY-MM in the given timezone', () => {
    // 2026-08-14T10:00Z → August in Belgrade
    expect(
      currentMonth(new Date('2026-08-14T10:00:00Z'), 'Europe/Belgrade')
    ).toBe('2026-08');
  });

  it('respects the timezone across the month boundary', () => {
    // 2026-08-31T23:00Z is still Aug 31 in UTC but already Sep 1 in Belgrade (+02).
    expect(
      currentMonth(new Date('2026-08-31T23:00:00Z'), 'Europe/Belgrade')
    ).toBe('2026-09');
    // ...and still August in Los Angeles (-07).
    expect(
      currentMonth(new Date('2026-08-31T23:00:00Z'), 'America/Los_Angeles')
    ).toBe('2026-08');
  });

  it('zero-pads single-digit months', () => {
    expect(
      currentMonth(new Date('2026-01-15T12:00:00Z'), 'Europe/Belgrade')
    ).toBe('2026-01');
  });
});
