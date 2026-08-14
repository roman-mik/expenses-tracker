import type { Currency, Expense } from './types';
import { daysInMonth } from './kapa-math';

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
