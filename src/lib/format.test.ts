import { describe, expect, it } from 'vitest';
import { formatMoney } from './format';

describe('formatMoney', () => {
  it('formats RSD as a grouped whole number (sr-RS uses . for thousands)', () => {
    expect(formatMoney(65000, 'RSD')).toBe('65.000');
    expect(formatMoney(100000, 'RSD')).toBe('100.000');
    expect(formatMoney(0, 'RSD')).toBe('0');
    expect(formatMoney(999, 'RSD')).toBe('999');
  });

  it('formats negative RSD (e.g. "left after this" going over)', () => {
    expect(formatMoney(-1500, 'RSD')).toBe('-1.500');
  });

  it('scales minor units for 2-decimal currencies', () => {
    // 12345 cents = 123,45 (sr-RS uses , for the decimal separator)
    expect(formatMoney(12345, 'EUR')).toBe('123,45');
  });

  it('appends the ISO code when asked', () => {
    expect(formatMoney(65000, 'RSD', { withCurrency: true })).toBe(
      '65.000 RSD'
    );
  });
});
