/**
 * Pure income derivation for Horizon — hourly-rate calculation (B1) and
 * annualized totals (B4). Same discipline as `lib/horizon/fx.ts`: integer
 * money throughout, no I/O, no `Date.now()`.
 */
import type { Money } from '@/lib/types';
import type { IncomeSchedule, IncomeStream } from './types';
import {
  daysInMonth,
  generateDates,
  isWorkingDay,
  type ScheduleCalendar,
} from './schedule';

function money(n: number): Money {
  return n as Money;
}

/**
 * rateMinor x hoursPerDay x workingDaysInPeriod, rounded half-up (JS's
 * `Math.round` already rounds half-up for positive inputs, which every
 * factor here is).
 */
export function hourlyIncomeForPeriod(
  rateMinor: number,
  hoursPerDay: number,
  workingDaysInPeriod: number
): Money {
  return money(Math.round(rateMinor * hoursPerDay * workingDaysInPeriod));
}

/**
 * Working days in a `YYYY-MM` month, derived from the calendar — never
 * hand-entered (B1's own acceptance criterion: fewer working days means
 * less derived income with no manual edit).
 */
export function workingDaysInMonth(
  month: string,
  calendar: ScheduleCalendar
): number {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const month0 = Number(monthStr) - 1;
  const total = daysInMonth(year, month0);

  let count = 0;
  for (let day = 1; day <= total; day++) {
    const date = `${yearStr}-${monthStr}-${String(day).padStart(2, '0')}`;
    if (isWorkingDay(date, calendar)) count++;
  }
  return count;
}

/**
 * A stream's derived amount for one `YYYY-MM` month. Hourly streams derive
 * from the calendar regardless of payment schedule (D9); fixed/variable
 * streams sum `fixedAmountMinor` once per schedule occurrence that actually
 * falls in the month, so a twice-monthly or quarterly schedule isn't
 * silently treated as once/month.
 */
export function monthlyIncomeForStream(
  stream: IncomeStream,
  schedules: IncomeSchedule[],
  month: string,
  calendar: ScheduleCalendar
): Money {
  if (stream.kind === 'hourly') {
    return hourlyIncomeForPeriod(
      stream.hourlyRateMinor,
      stream.hoursPerDay,
      workingDaysInMonth(month, calendar)
    );
  }

  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const month0 = Number(monthStr) - 1;
  const from = `${month}-01`;
  const to = `${month}-${String(daysInMonth(year, month0)).padStart(2, '0')}`;

  const occurrences = schedules
    .filter((s) => s.incomeStreamId === stream.id)
    .reduce(
      (sum, s) => sum + generateDates(s, calendar, { from, to }).length,
      0
    );
  return money(stream.fixedAmountMinor * occurrences);
}

/**
 * Sums every stream's derived amount across the 12 months of `year`.
 * One-off streams are excluded unless `includeOneOff` (B4's toggle);
 * archived streams are always excluded.
 */
export function annualizedIncome(
  streams: IncomeStream[],
  schedules: IncomeSchedule[],
  calendar: ScheduleCalendar,
  year: number,
  { includeOneOff = false }: { includeOneOff?: boolean } = {}
): Money {
  let total = 0;
  for (const stream of streams) {
    if (stream.archived) continue;
    if (stream.recurrence === 'oneOff' && !includeOneOff) continue;
    for (let m = 1; m <= 12; m++) {
      const month = `${year}-${String(m).padStart(2, '0')}`;
      total += monthlyIncomeForStream(stream, schedules, month, calendar);
    }
  }
  return money(Math.round(total));
}
