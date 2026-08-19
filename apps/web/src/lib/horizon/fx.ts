/**
 * The one piece of real math in the horizon data layer. Pure, integer-only
 * (via BigInt so a large amount x rate product never risks overflowing
 * Number.MAX_SAFE_INTEGER), and never reads `Date.now()` — every date is
 * passed in, so the same inputs always give the same outputs (spec §7).
 * Mirrors the `lib/kapa-math.ts` discipline.
 */
import { CURRENCY_EXPONENT, type Currency } from '@/lib/types';
import type { FxRate } from './types';

// BigInt literals (`0n`) need an ES2020 target; this repo's tsconfig targets
// ES2017, so every bigint here goes through the `BigInt(...)` constructor
// instead.
const ZERO = BigInt(0);
const TEN = BigInt(10);
const RATE_SCALE = BigInt(100_000_000); // 10^8

/**
 * Converts an integer minor-unit amount from `from` to `to` using `rate`
 * (must be a `from -> to` snapshot; identity conversions need no rate at
 * all). Rounds half-up, away from zero — e.g. both +0.5 and -0.5 round to
 * the larger-magnitude integer, so a conversion never quietly rounds a debt
 * toward zero.
 *
 * quoteMinor = round( amountMinor x rate_e8 x 10^(quoteExp - baseExp) / 10^8 )
 */
export function convert(
  amountMinor: number,
  from: Currency,
  to: Currency,
  rate: FxRate | null
): number {
  if (from === to) return amountMinor;
  if (!rate) {
    throw new Error(`No FX rate available for ${from} -> ${to}`);
  }
  if (rate.baseCode !== from || rate.quoteCode !== to) {
    throw new Error(
      `Rate mismatch: expected ${from} -> ${to}, got ${rate.baseCode} -> ${rate.quoteCode}`
    );
  }

  const expDiff = CURRENCY_EXPONENT[to] - CURRENCY_EXPONENT[from];
  const amount = BigInt(amountMinor);
  const rateE8 = BigInt(rate.rateE8);

  const [numerator, denominator] =
    expDiff >= 0
      ? [amount * rateE8 * TEN ** BigInt(expDiff), RATE_SCALE]
      : [amount * rateE8, RATE_SCALE * TEN ** BigInt(-expDiff)];

  return Number(divRoundHalfUpAwayFromZero(numerator, denominator));
}

function divRoundHalfUpAwayFromZero(
  numerator: bigint,
  denominator: bigint
): bigint {
  const negative = numerator < ZERO !== denominator < ZERO;
  const n = numerator < ZERO ? -numerator : numerator;
  const d = denominator < ZERO ? -denominator : denominator;
  const quotient = n / d;
  const remainder = n % d;
  const rounded = BigInt(2) * remainder >= d ? quotient + BigInt(1) : quotient;
  return negative ? -rounded : rounded;
}

/**
 * The newest snapshot for `base -> quote` dated on or before `onOrBefore` —
 * NOT "the latest row". This is what makes "the same projection tomorrow
 * gives the same numbers" true: a view pinned to an older date must never
 * see a rate published after it.
 */
export function pickRate(
  rates: FxRate[],
  {
    base,
    quote,
    onOrBefore,
  }: { base: Currency; quote: Currency; onOrBefore: string }
): FxRate | null {
  let newest: FxRate | null = null;
  for (const rate of rates) {
    if (rate.baseCode !== base || rate.quoteCode !== quote) continue;
    if (rate.asOfDate > onOrBefore) continue;
    if (!newest || rate.asOfDate > newest.asOfDate) newest = rate;
  }
  return newest;
}

export function rateAgeDays(asOfDate: string, today: string): number {
  const asOf = Date.parse(`${asOfDate}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  return Math.round((now - asOf) / 86_400_000);
}

const STALE_THRESHOLD_DAYS = 30;

export function isStale(asOfDate: string, today: string): boolean {
  return rateAgeDays(asOfDate, today) > STALE_THRESHOLD_DAYS;
}
