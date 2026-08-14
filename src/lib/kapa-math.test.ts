import { describe, it, expect } from 'vitest';
import {
  monthWindow,
  daysInMonth,
  daysLeft,
  elapsedDays,
  remaining,
  safeDaily,
  evenPace,
  paceGap,
  projection,
  spentPct,
} from './kapa-math';

describe('daysInMonth', () => {
  it('handles 31/30/28/29-day months', () => {
    expect(daysInMonth('2026-01')).toBe(31);
    expect(daysInMonth('2026-04')).toBe(30);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2024-02')).toBe(29); // leap year
  });
  it('rejects malformed month', () => {
    expect(() => daysInMonth('2026-13')).toThrow();
    expect(() => daysInMonth('2026-1')).toThrow();
  });
});

describe('monthWindow', () => {
  it('returns an exclusive first-of-next-month end (UTC tz)', () => {
    const { startUtc, endUtc } = monthWindow('2026-08', 'UTC');
    expect(startUtc.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });
  it('accounts for a positive offset (Europe/Belgrade = UTC+2 in summer)', () => {
    const { startUtc, endUtc } = monthWindow('2026-08', 'Europe/Belgrade');
    // Local Aug 1 00:00 CEST = Jul 31 22:00 UTC
    expect(startUtc.toISOString()).toBe('2026-07-31T22:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-08-31T22:00:00.000Z');
  });
  it('crosses a DST boundary correctly (Belgrade, March)', () => {
    // Belgrade switches CET(+1)→CEST(+2) on the last Sunday of March 2026 (Mar 29).
    const { startUtc, endUtc } = monthWindow('2026-03', 'Europe/Belgrade');
    expect(startUtc.toISOString()).toBe('2026-02-28T23:00:00.000Z'); // Mar 1 00:00 CET
    expect(endUtc.toISOString()).toBe('2026-03-31T22:00:00.000Z'); // Apr 1 00:00 CEST
  });
});

describe('daysLeft (excludes today)', () => {
  it('first day of month → D-1', () => {
    const now = new Date('2026-08-01T09:00:00Z'); // Aug 1, still Aug 1 in Belgrade
    expect(daysLeft('2026-08', now, 'Europe/Belgrade')).toBe(30);
  });
  it('last day of month → 0', () => {
    const now = new Date('2026-08-31T09:00:00Z');
    expect(daysLeft('2026-08', now, 'Europe/Belgrade')).toBe(0);
  });
  it('mid-month', () => {
    const now = new Date('2026-08-15T09:00:00Z');
    expect(daysLeft('2026-08', now, 'Europe/Belgrade')).toBe(16); // 31 - 15
  });
  it('before the month starts → D', () => {
    const now = new Date('2026-07-15T09:00:00Z');
    expect(daysLeft('2026-08', now, 'Europe/Belgrade')).toBe(31);
  });
  it('after the month ends → 0', () => {
    const now = new Date('2026-09-05T09:00:00Z');
    expect(daysLeft('2026-08', now, 'Europe/Belgrade')).toBe(0);
  });
  it('respects timezone at local midnight boundary', () => {
    // 2026-08-01T22:30Z is Aug 2 00:30 in Belgrade (UTC+2) → day-of-month 2.
    const now = new Date('2026-08-01T22:30:00Z');
    expect(daysLeft('2026-08', now, 'Europe/Belgrade')).toBe(29); // 31 - 2
    // ...but still Aug 1 in UTC → day-of-month 1.
    expect(daysLeft('2026-08', now, 'UTC')).toBe(30); // 31 - 1
  });
});

describe('elapsedDays', () => {
  it('first day → 1', () => {
    expect(elapsedDays(31, 30)).toBe(1);
  });
  it('last day → D', () => {
    expect(elapsedDays(31, 0)).toBe(31);
  });
  it('clamps to >= 1', () => {
    expect(elapsedDays(31, 31)).toBe(1);
  });
});

describe('remaining', () => {
  it('spent < cap', () => {
    expect(remaining(100000, 35000)).toBe(65000);
  });
  it('spent == cap → 0', () => {
    expect(remaining(100000, 100000)).toBe(0);
  });
  it('over cap never negative', () => {
    expect(remaining(100000, 120000)).toBe(0);
  });
});

describe('safeDaily', () => {
  it('last day (daysLeft=0) → spend it all today, no div-by-zero', () => {
    expect(safeDaily(5000, 0)).toBe(5000);
  });
  it('mid-month divides by daysLeft + 1', () => {
    expect(safeDaily(64000, 15)).toBe(4000); // 64000 / 16
  });
  it('nothing remaining → 0', () => {
    expect(safeDaily(0, 10)).toBe(0);
  });
});

describe('evenPace / paceGap', () => {
  it('even pace at mid-month', () => {
    expect(evenPace(100000, 15, 30)).toBe(50000);
  });
  it('first day even pace is small', () => {
    expect(evenPace(93000, 1, 31)).toBe(3000);
  });
  it('under pace → positive gap', () => {
    expect(paceGap(evenPace(100000, 15, 30), 40000)).toBe(10000);
  });
  it('ahead of pace → negative gap', () => {
    expect(paceGap(evenPace(100000, 15, 30), 60000)).toBe(-10000);
  });
});

describe('projection', () => {
  it("first day projects one day's spend across the month", () => {
    expect(projection(3000, 1, 31)).toBe(93000);
  });
  it('empty month → 0', () => {
    expect(projection(0, 1, 31)).toBe(0);
  });
  it('over-cap trajectory projects above cap', () => {
    expect(projection(60000, 15, 30)).toBe(120000);
  });
});

describe('spentPct', () => {
  it('empty month → 0', () => {
    expect(spentPct(0, 100000)).toBe(0);
  });
  it('cap=0 & spent=0 → 0', () => {
    expect(spentPct(0, 0)).toBe(0);
  });
  it('cap=0 & spent>0 → 100', () => {
    expect(spentPct(500, 0)).toBe(100);
  });
  it('over cap clamps to 100', () => {
    expect(spentPct(120000, 100000)).toBe(100);
  });
  it('rounds to nearest percent', () => {
    expect(spentPct(495, 1000)).toBe(50); // 49.5 → 50
    expect(spentPct(354, 1000)).toBe(35); // 35.4 → 35
  });
});
