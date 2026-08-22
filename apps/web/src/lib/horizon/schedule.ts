/**
 * Pure schedule-generation engine for Horizon income — this epic's
 * equivalent of `lib/horizon/fx.ts`. No I/O, no `Date.now()`; every date is
 * passed in, so results are reproducible (spec §7).
 *
 * All dates are `YYYY-MM-DD` strings, compared lexicographically (that only
 * works because the format is fixed-width and zero-padded) and computed in
 * UTC throughout, so there is no local-timezone drift across the date-only
 * arithmetic below.
 */
import type { CoversPeriod, ScheduleKind, SlippagePolicy } from './types';

const MS_PER_DAY = 86_400_000;

/** The pieces of the household's calendar this engine actually needs. */
export interface ScheduleCalendar {
  /** 0=Sun..6=Sat. */
  workingWeekdays: number[];
  /** `YYYY-MM-DD`. */
  holidays: string[];
}

/**
 * Structural shape every concrete schedule (income, obligation, ...) must
 * satisfy to run through this engine. `IncomeSchedule` and `ObligationSchedule`
 * each add their own `id` and owner FK on top of this.
 */
export interface ScheduleRule {
  kind: ScheduleKind;
  dayOfMonth: number | null;
  intervalDays: number | null;
  nthWeekday: number | null;
  weekday: number | null;
  anchorDate: string | null;
  slippagePolicy: SlippagePolicy;
  coversPeriod: CoversPeriod;
}

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return formatDate(new Date(parseDate(date).getTime() + days * MS_PER_DAY));
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function weekdayOf(date: string): number {
  return parseDate(date).getUTCDay();
}

/** True if `date` is a working weekday and not a stored holiday. */
export function isWorkingDay(
  date: string,
  calendar: ScheduleCalendar
): boolean {
  if (!calendar.workingWeekdays.includes(weekdayOf(date))) return false;
  if (calendar.holidays.includes(date)) return false;
  return true;
}

/**
 * Shifts `date` per `policy` if it isn't a working day. `'none'` never
 * shifts. Bounded to a year of iterations — a calendar with zero working
 * weekdays (a pathological but not DB-rejected state) would otherwise loop
 * forever; in that case the original date is returned unchanged.
 */
export function applySlippage(
  date: string,
  calendar: ScheduleCalendar,
  policy: SlippagePolicy
): string {
  if (policy === 'none' || isWorkingDay(date, calendar)) return date;

  const step = policy === 'nextBusinessDay' ? 1 : -1;
  let candidate = date;
  for (let i = 0; i < 366; i++) {
    candidate = addDays(candidate, step);
    if (isWorkingDay(candidate, calendar)) return candidate;
  }
  return date;
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

/** The nth (1-5) occurrence of `weekday` in a month, or null if it doesn't exist. */
function nthWeekdayOfMonth(
  year: number,
  month0: number,
  weekday: number,
  nth: number
): string | null {
  const firstWeekday = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  const day = 1 + ((weekday - firstWeekday + 7) % 7) + (nth - 1) * 7;
  if (day > daysInMonth(year, month0)) return null;
  return formatDate(new Date(Date.UTC(year, month0, day)));
}

/**
 * Expands a schedule rule into the concrete dates it fires on within
 * `[from, to]` (both inclusive). Unshifted — apply `applySlippage`
 * separately per date, since slippage depends on the calendar the same way
 * generation does but is a distinct step (B3).
 */
export function generateDates<T extends ScheduleRule>(
  schedule: T,
  calendar: ScheduleCalendar,
  range: { from: string; to: string }
): string[] {
  const { from, to } = range;
  if (from > to) return [];
  const dates: string[] = [];

  switch (schedule.kind) {
    case 'oneOff': {
      if (
        schedule.anchorDate &&
        schedule.anchorDate >= from &&
        schedule.anchorDate <= to
      ) {
        dates.push(schedule.anchorDate);
      }
      break;
    }

    case 'everyNDays': {
      if (!schedule.anchorDate || !schedule.intervalDays) break;
      let cursor = schedule.anchorDate;
      if (cursor < from) {
        const dayGap = Math.floor(
          (parseDate(from).getTime() - parseDate(cursor).getTime()) / MS_PER_DAY
        );
        const steps = Math.floor(dayGap / schedule.intervalDays);
        cursor = addDays(cursor, steps * schedule.intervalDays);
        while (cursor < from) cursor = addDays(cursor, schedule.intervalDays);
      }
      while (cursor <= to) {
        dates.push(cursor);
        cursor = addDays(cursor, schedule.intervalDays);
      }
      break;
    }

    case 'dayOfMonth': {
      if (!schedule.dayOfMonth) break;
      for (const { year, month0 } of monthsBetween(from, to)) {
        // Clamped, not skipped: the 31st in a 30-day month lands on the 30th.
        const day = Math.min(schedule.dayOfMonth, daysInMonth(year, month0));
        const date = formatDate(new Date(Date.UTC(year, month0, day)));
        if (date >= from && date <= to) dates.push(date);
      }
      break;
    }

    case 'monthEnd': {
      for (const { year, month0 } of monthsBetween(from, to)) {
        const date = formatDate(
          new Date(Date.UTC(year, month0, daysInMonth(year, month0)))
        );
        if (date >= from && date <= to) dates.push(date);
      }
      break;
    }

    case 'nthWeekday': {
      if (!schedule.nthWeekday || schedule.weekday === null) break;
      for (const { year, month0 } of monthsBetween(from, to)) {
        const date = nthWeekdayOfMonth(
          year,
          month0,
          schedule.weekday,
          schedule.nthWeekday
        );
        if (date && date >= from && date <= to) dates.push(date);
      }
      break;
    }
  }

  return dates;
}

export interface UpcomingOccurrence {
  /** The (possibly slipped) date this occurrence actually lands on. */
  date: string;
  shifted: boolean;
  /** Present only when `shifted` — the date before slippage. */
  originalDate?: string;
}

/** Powers the schedule editor's preview (B2/B3). Searches up to 2 years out. */
export function nextSixDates<T extends ScheduleRule>(
  schedule: T,
  calendar: ScheduleCalendar,
  from: string
): UpcomingOccurrence[] {
  const raw = generateDates(schedule, calendar, {
    from,
    to: addDays(from, 730),
  }).slice(0, 6);

  return raw.map((date) => {
    const shiftedDate = applySlippage(date, calendar, schedule.slippagePolicy);
    return shiftedDate === date
      ? { date, shifted: false }
      : { date: shiftedDate, shifted: true, originalDate: date };
  });
}

export interface UpcomingStreamOccurrence extends UpcomingOccurrence {
  scheduleId: string;
}

/**
 * Merges and sorts the next `count` occurrences across every schedule on a
 * stream — B2's "the 15th **and** month end" preview.
 */
export function nextDatesForSchedules<T extends ScheduleRule & { id: string }>(
  schedules: T[],
  calendar: ScheduleCalendar,
  from: string,
  count = 6
): UpcomingStreamOccurrence[] {
  const to = addDays(from, 730);
  const all = schedules.flatMap((schedule) =>
    generateDates(schedule, calendar, { from, to }).map((date) => ({
      date,
      scheduleId: schedule.id,
    }))
  );
  all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return all.slice(0, count).map(({ date, scheduleId }) => {
    // Non-null: `scheduleId` was just derived from `schedules` above.
    const schedule = schedules.find((s) => s.id === scheduleId)!;
    const shiftedDate = applySlippage(date, calendar, schedule.slippagePolicy);
    return shiftedDate === date
      ? { date, shifted: false, scheduleId }
      : { date: shiftedDate, shifted: true, originalDate: date, scheduleId };
  });
}

/**
 * The `YYYY-MM` period a payment on `paymentDate` covers, per `rule.coversPeriod`.
 * `paymentDate` must be the UNSLIPPED generated date (`originalDate ?? date`
 * from `nextSixDates`/`nextDatesForSchedules`), never the slipped one — rent
 * due 31 Aug that slips to 1 Sep still covers September, not October.
 */
export function coveredPeriod(paymentDate: string, rule: ScheduleRule): string {
  const d = parseDate(paymentDate);
  let year = d.getUTCFullYear();
  let month0 = d.getUTCMonth();

  if (rule.coversPeriod === 'next') {
    month0++;
    if (month0 > 11) {
      month0 = 0;
      year++;
    }
  } else if (rule.coversPeriod === 'previous') {
    month0--;
    if (month0 < 0) {
      month0 = 11;
      year--;
    }
  }

  return `${year}-${String(month0 + 1).padStart(2, '0')}`;
}
