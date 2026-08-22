/**
 * Billable-hours math for Horizon (C6) — "what an hour is actually worth"
 * across every hourly income stream, and what an obligation costs in hours
 * of that blended rate. Same discipline as `lib/horizon/fx.ts`: integer
 * money throughout, no I/O, no `Date.now()`.
 */
import type { Currency, Money } from '@/lib/types';
import type { FxRate } from '@/lib/horizon/types';
import { convert, pickRate } from '@/lib/horizon/fx';
import { daysInMonth, type ScheduleCalendar } from '@/lib/horizon/schedule';
import { workingDaysInMonth } from '@/lib/horizon/income/income-math';
import type { IncomeStream } from '@/lib/horizon/income/types';

function money(n: number): Money {
  return n as Money;
}

/**
 * Σ (converted monthly income of non-archived, recurring, hourly streams) /
 * Σ (hoursPerDay x workingDaysInMonth) across every hourly stream — not a
 * pick of one. `null` if a needed FX rate is missing (never thrown, mirrors
 * `categoryShares`).
 */
export function blendedHourlyRate(
  streams: IncomeStream[],
  calendar: ScheduleCalendar,
  month: string,
  reportingCurrency: Currency,
  rates: FxRate[]
): Money | null {
  const hourly = streams.filter(
    (s) => s.kind === 'hourly' && !s.archived && s.recurrence === 'recurring'
  );
  if (hourly.length === 0) return null;

  const workingDays = workingDaysInMonth(month, calendar);
  const [yearStr, monthStr] = month.split('-');
  const monthEnd = `${month}-${String(daysInMonth(Number(yearStr), Number(monthStr) - 1)).padStart(2, '0')}`;

  let totalIncomeMinor = 0;
  let totalHours = 0;

  for (const stream of hourly) {
    if (stream.kind !== 'hourly') continue;
    const monthlyMinor = Math.round(
      stream.hourlyRateMinor * stream.hoursPerDay * workingDays
    );

    let convertedMinor: number;
    if (stream.currency === reportingCurrency) {
      convertedMinor = monthlyMinor;
    } else {
      const rate = pickRate(rates, {
        base: stream.currency,
        quote: reportingCurrency,
        onOrBefore: monthEnd,
      });
      if (!rate) return null;
      convertedMinor = convert(
        monthlyMinor,
        stream.currency,
        reportingCurrency,
        rate
      );
    }

    totalIncomeMinor += convertedMinor;
    totalHours += stream.hoursPerDay * workingDays;
  }

  if (totalHours === 0) return null;
  return money(Math.round(totalIncomeMinor / totalHours));
}

/**
 * `amount / (blendedRate x fx)` — C6's "amount divided by (hourly rate x
 * reporting FX)". `null` if `blendedRateMinor` is zero/missing or the
 * amount's currency has no usable rate into `reportingCurrency`.
 */
export function obligationCostInHours(
  amountMinor: number,
  currency: Currency,
  blendedRateMinor: number | null,
  reportingCurrency: Currency,
  rates: FxRate[],
  onOrBefore: string
): number | null {
  if (!blendedRateMinor || blendedRateMinor <= 0) return null;

  let convertedMinor: number;
  if (currency === reportingCurrency) {
    convertedMinor = amountMinor;
  } else {
    const rate = pickRate(rates, {
      base: currency,
      quote: reportingCurrency,
      onOrBefore,
    });
    if (!rate) return null;
    convertedMinor = convert(amountMinor, currency, reportingCurrency, rate);
  }

  return convertedMinor / blendedRateMinor;
}

/**
 * Σ hoursPerDay x workingDaysInMonth across active, recurring hourly
 * streams — the figure C6's total-obligation-hours gets compared against.
 */
export function availableWorkingHours(
  streams: IncomeStream[],
  calendar: ScheduleCalendar,
  month: string
): number {
  const workingDays = workingDaysInMonth(month, calendar);
  return streams
    .filter(
      (s) => s.kind === 'hourly' && !s.archived && s.recurrence === 'recurring'
    )
    .reduce(
      (sum, s) => sum + (s.kind === 'hourly' ? s.hoursPerDay * workingDays : 0),
      0
    );
}
