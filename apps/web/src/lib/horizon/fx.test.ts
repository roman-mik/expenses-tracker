import { describe, it, expect } from 'vitest';
import { convert, pickRate, rateAgeDays, isStale } from './fx';
import type { FxRate } from './types';

function rate(partial: Partial<FxRate> = {}): FxRate {
  return {
    baseCode: 'EUR',
    quoteCode: 'RSD',
    rateE8: 10_000_000_000, // 1 EUR = 100 RSD
    asOfDate: '2026-08-01',
    source: 'test-provider',
    ...partial,
  };
}

describe('convert', () => {
  it('is the identity when from === to, with no rate needed', () => {
    expect(convert(500, 'EUR', 'EUR', null)).toBe(500);
  });

  it('converts EUR (2dp) -> RSD (0dp) using a direct rate', () => {
    // 1 EUR = 100 RSD. 250 minor units EUR = 2.50 EUR -> 250 RSD.
    expect(convert(250, 'EUR', 'RSD', rate())).toBe(250);
  });

  it('converts RSD (0dp) -> EUR (2dp) using a direct (not inverted) rate', () => {
    // A separately-fetched direct rate, not derived by inverting the above.
    // 1 RSD = 0.01 EUR. 250 RSD -> 2.50 EUR = 250 minor units EUR.
    const rsdToEur = rate({
      baseCode: 'RSD',
      quoteCode: 'EUR',
      rateE8: 1_000_000,
    });
    expect(convert(250, 'RSD', 'EUR', rsdToEur)).toBe(250);
  });

  it('throws when the rate is missing', () => {
    expect(() => convert(100, 'EUR', 'RSD', null)).toThrow();
  });

  it('throws when the rate is for the wrong pair', () => {
    expect(() =>
      convert(100, 'EUR', 'RSD', rate({ baseCode: 'USD' }))
    ).toThrow();
  });

  it('rounds exactly at the half away from zero, both signs', () => {
    // Both currencies at the same exponent (expDiff = 0): 1 unit x 0.5 rate
    // = 0.5 exactly.
    const half = rate({
      baseCode: 'EUR',
      quoteCode: 'USD',
      rateE8: 50_000_000,
    });
    expect(convert(1, 'EUR', 'USD', half)).toBe(1);
    expect(convert(-1, 'EUR', 'USD', half)).toBe(-1);

    const justUnder = rate({
      baseCode: 'EUR',
      quoteCode: 'USD',
      rateE8: 49_999_999,
    });
    expect(convert(1, 'EUR', 'USD', justUnder)).toBe(0);

    const justOver = rate({
      baseCode: 'EUR',
      quoteCode: 'USD',
      rateE8: 50_000_001,
    });
    expect(convert(1, 'EUR', 'USD', justOver)).toBe(1);
  });
});

describe('pickRate', () => {
  const rates: FxRate[] = [
    rate({ asOfDate: '2026-08-01' }),
    rate({ asOfDate: '2026-08-10' }),
    rate({ asOfDate: '2026-08-20' }),
  ];

  it('picks the newest snapshot on or before the given date, not the latest overall', () => {
    expect(
      pickRate(rates, { base: 'EUR', quote: 'RSD', onOrBefore: '2026-08-15' })
        ?.asOfDate
    ).toBe('2026-08-10');
  });

  it('returns null when every snapshot is after the given date', () => {
    expect(
      pickRate(rates, { base: 'EUR', quote: 'RSD', onOrBefore: '2026-07-31' })
    ).toBeNull();
  });

  it('returns null when no snapshot matches the pair', () => {
    expect(
      pickRate(rates, { base: 'USD', quote: 'RSD', onOrBefore: '2026-08-20' })
    ).toBeNull();
  });

  it('an exact match on the boundary date counts as on-or-before', () => {
    expect(
      pickRate(rates, { base: 'EUR', quote: 'RSD', onOrBefore: '2026-08-10' })
        ?.asOfDate
    ).toBe('2026-08-10');
  });
});

describe('rateAgeDays / isStale', () => {
  it('is not stale at exactly 29 days old', () => {
    expect(rateAgeDays('2026-08-01', '2026-08-30')).toBe(29);
    expect(isStale('2026-08-01', '2026-08-30')).toBe(false);
  });

  it('is not stale at exactly 30 days old (the threshold is exclusive)', () => {
    expect(rateAgeDays('2026-08-01', '2026-08-31')).toBe(30);
    expect(isStale('2026-08-01', '2026-08-31')).toBe(false);
  });

  it('is stale at 31 days old', () => {
    expect(rateAgeDays('2026-08-01', '2026-09-01')).toBe(31);
    expect(isStale('2026-08-01', '2026-09-01')).toBe(true);
  });
});
