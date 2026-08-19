import type { Currency, Expense } from './types';
import { daysInMonth } from './pocket-math';

/**
 * Timezone-aware calendar-day key ('YYYY-MM-DD') for grouping expenses by day
 * in the user's local timezone (so "today" means their today, not UTC's).
 */
export function zonedDateKey(instant: Date, timeZone: string): string {
  // en-CA renders ISO-style YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * One zero-filled entry per calendar day of `month`, summing expense amounts
 * bucketed by their `zonedDateKey`. Rows in a currency other than the
 * household's are skipped (mirrors `getSummary`'s active-currency split — no
 * FX conversion in v1).
 */
export function dailyTotals(
  expenses: Expense[],
  month: string,
  timeZone: string,
  currency: Currency
): { dateKey: string; amountMinor: number }[] {
  const days = daysInMonth(month);
  const totals = new Map<string, number>();
  for (let d = 1; d <= days; d++) {
    totals.set(`${month}-${String(d).padStart(2, '0')}`, 0);
  }

  for (const e of expenses) {
    if (e.currency !== currency) continue;
    const key = zonedDateKey(new Date(e.spentAt), timeZone);
    if (totals.has(key)) {
      totals.set(key, (totals.get(key) ?? 0) + e.amountMinor);
    }
  }

  return [...totals.entries()].map(([dateKey, amountMinor]) => ({
    dateKey,
    amountMinor,
  }));
}

/**
 * Human day label ("Today", "Yesterday", else a locale-formatted weekday/day/
 * month). `today`/`yesterday` are passed in translated (this module stays
 * framework-agnostic — no next-intl import) since only those two cases have
 * warm copy; every other day falls back to `Intl.DateTimeFormat`.
 */
export function dayLabel(
  dateKey: string,
  todayKey: string,
  yesterdayKey: string,
  spentAt: string,
  timeZone: string,
  locale: string,
  labels: { today: string; yesterday: string }
): string {
  if (dateKey === todayKey) return labels.today;
  if (dateKey === yesterdayKey) return labels.yesterday;
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(new Date(spentAt));
}
