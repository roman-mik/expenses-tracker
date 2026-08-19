/**
 * Money display. Single source for turning integer minor units into the
 * Serbian-formatted strings the design uses (e.g. 65000 RSD → "65.000").
 *
 * Formatting only — never use this for arithmetic (pocket-math stays integer).
 */
import { CURRENCY_EXPONENT, type Currency } from './types';

/**
 * Format an integer minor-unit amount for display in `sr-RS` locale.
 * RSD (exponent 0) → grouped whole number; EUR/USD → 2 decimals.
 * `withCurrency` appends the ISO code (the design shows it as a separate label,
 * so it defaults to off).
 */
export function formatMoney(
  minor: number,
  currency: Currency,
  { withCurrency = false }: { withCurrency?: boolean } = {}
): string {
  const exponent = CURRENCY_EXPONENT[currency];
  const value = minor / 10 ** exponent;
  const number = new Intl.NumberFormat('sr-RS', {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(value);
  return withCurrency ? `${number} ${currency}` : number;
}
