/**
 * Pure spending derivation for Horizon — obligation/daily-expense monthly
 * totals (C1/C4) and category share-of-total (C7). Same discipline as
 * `lib/horizon/income/income-math.ts`: integer money throughout, no I/O, no
 * `Date.now()`.
 */
import type { Currency, Money } from '@/lib/types';
import type { FxRate } from '@/lib/horizon/types';
import { convert, pickRate } from '@/lib/horizon/fx';
import {
  daysInMonth,
  generateDates,
  type ScheduleCalendar,
  type ScheduleRule,
} from '@/lib/horizon/schedule';
import type { ChargeCadence } from './types';

function money(n: number): Money {
  return n as Money;
}

/**
 * An obligation's derived amount for one `YYYY-MM` month: `amountMinor` x
 * occurrences actually falling in the month (via `generateDates`) — same
 * discipline as `monthlyIncomeForStream`. A twice-monthly obligation is
 * never silently treated as once/month.
 */
export function monthlyObligationTotal<T extends ScheduleRule>(
  amountMinor: number,
  schedules: T[],
  month: string,
  calendar: ScheduleCalendar
): Money {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const month0 = Number(monthStr) - 1;
  const from = `${month}-01`;
  const to = `${month}-${String(daysInMonth(year, month0)).padStart(2, '0')}`;

  const occurrences = schedules.reduce(
    (sum, s) => sum + generateDates(s, calendar, { from, to }).length,
    0
  );
  return money(amountMinor * occurrences);
}

/**
 * `dailyAmount` x CALENDAR days in the month — deliberately not working
 * days; groceries don't take weekends off.
 */
export function dailyExpenseForMonth(
  dailyAmountMinor: number,
  month: string
): Money {
  const [yearStr, monthStr] = month.split('-');
  const total = daysInMonth(Number(yearStr), Number(monthStr) - 1);
  return money(dailyAmountMinor * total);
}

/** C4's "shows the monthly total for 28-, 30- and 31-day months". */
export function monthLengthVariants(dailyAmountMinor: number): {
  d28: Money;
  d30: Money;
  d31: Money;
} {
  return {
    d28: money(dailyAmountMinor * 28),
    d30: money(dailyAmountMinor * 30),
    d31: money(dailyAmountMinor * 31),
  };
}

/**
 * The dates a daily-accrual expense actually posts on within `[from, to]`,
 * per `cadence`: every calendar day, every 7th day from `startDate`, or
 * once a month on `startDate`'s day-of-month (clamped, like `dayOfMonth`
 * schedules).
 */
export function chargeDates(
  expense: { startDate: string; chargeCadence: ChargeCadence },
  range: { from: string; to: string }
): string[] {
  const { startDate, chargeCadence } = expense;
  const { from, to } = range;
  if (from > to) return [];

  if (chargeCadence === 'daily') {
    const dates: string[] = [];
    let cursor = startDate > from ? startDate : from;
    while (cursor <= to) {
      dates.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return dates;
  }

  if (chargeCadence === 'weekly') {
    const dates: string[] = [];
    let cursor = startDate;
    if (cursor < from) {
      const dayGap = daysBetween(cursor, from);
      const steps = Math.floor(dayGap / 7);
      cursor = addDays(cursor, steps * 7);
      while (cursor < from) cursor = addDays(cursor, 7);
    }
    while (cursor <= to) {
      dates.push(cursor);
      cursor = addDays(cursor, 7);
    }
    return dates;
  }

  // monthly: same day-of-month as startDate, clamped to shorter months.
  const anchorDay = Number(startDate.slice(8, 10));
  const dates: string[] = [];
  for (const { year, month0 } of monthsBetween(from, to)) {
    const day = Math.min(anchorDay, daysInMonth(year, month0));
    const date = `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (date >= from && date <= to && date >= startDate) dates.push(date);
  }
  return dates;
}

/** The lump sum for one charge — `dailyAmount` x the days it covers. */
export function chargeAmount(
  dailyAmountMinor: number,
  cadence: ChargeCadence,
  periodDays: number
): Money {
  const days = cadence === 'daily' ? 1 : cadence === 'weekly' ? 7 : periodDays;
  return money(dailyAmountMinor * days);
}

export interface CategoryShare {
  category: string;
  totalMinor: Money;
  sharePct: number;
  hasMissingRate: boolean;
}

/**
 * C7. Converts each row to `reportingCurrency` via `fx.ts` first. A row
 * with no usable rate is excluded from the total and flagged
 * (`hasMissingRate`) rather than thrown — mirrors `today.ts`'s
 * `summarizeToday`.
 */
export function categoryShares(
  rows: { category: string; amountMinor: number; currency: Currency }[],
  reportingCurrency: Currency,
  rates: FxRate[],
  onOrBefore: string
): CategoryShare[] {
  const byCategory = new Map<
    string,
    { totalMinor: number; hasMissingRate: boolean }
  >();

  for (const row of rows) {
    let converted: number | null = null;
    let missing = false;
    if (row.currency === reportingCurrency) {
      converted = row.amountMinor;
    } else {
      const rate = pickRate(rates, {
        base: row.currency,
        quote: reportingCurrency,
        onOrBefore,
      });
      if (rate) {
        converted = convert(
          row.amountMinor,
          row.currency,
          reportingCurrency,
          rate
        );
      } else {
        missing = true;
      }
    }

    const entry = byCategory.get(row.category) ?? {
      totalMinor: 0,
      hasMissingRate: false,
    };
    if (converted !== null) entry.totalMinor += converted;
    if (missing) entry.hasMissingRate = true;
    byCategory.set(row.category, entry);
  }

  const grandTotal = [...byCategory.values()].reduce(
    (sum, e) => sum + e.totalMinor,
    0
  );

  return [...byCategory.entries()].map(([category, e]) => ({
    category,
    totalMinor: money(e.totalMinor),
    sharePct: grandTotal === 0 ? 0 : (e.totalMinor / grandTotal) * 100,
    hasMissingRate: e.hasMissingRate,
  }));
}

// --- date helpers (UTC, YYYY-MM-DD strings — same discipline as schedule.ts) ---

const MS_PER_DAY = 86_400_000;

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return formatDate(new Date(parseDate(date).getTime() + days * MS_PER_DAY));
}

function daysBetween(from: string, to: string): number {
  return Math.floor(
    (parseDate(to).getTime() - parseDate(from).getTime()) / MS_PER_DAY
  );
}

function monthsBetween(
  from: string,
  to: string
): { year: number; month0: number }[] {
  const months: { year: number; month0: number }[] = [];
  let year = parseDate(from).getUTCFullYear();
  let month0 = parseDate(from).getUTCMonth();
  const endYear = parseDate(to).getUTCFullYear();
  const endMonth0 = parseDate(to).getUTCMonth();
  while (year < endYear || (year === endYear && month0 <= endMonth0)) {
    months.push({ year, month0 });
    month0++;
    if (month0 > 11) {
      month0 = 0;
      year++;
    }
  }
  return months;
}
