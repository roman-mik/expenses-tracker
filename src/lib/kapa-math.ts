/**
 * kapa-math — the derived-value formulas that power Kapa.
 *
 * Pure functions, no I/O, currency-agnostic: every amount is an integer in
 * minor units of a SINGLE currency. Callers must not mix currencies here.
 *
 * `daysLeft` convention (IMPORTANT — the whole formula suite depends on it):
 *   `daysLeft` counts whole days remaining in the month EXCLUDING today,
 *   so it ranges 0 .. D-1 and matches the product's "N days until reset"
 *   countdown. Consequently:
 *     - elapsedDays = daysInMonth - daysLeft   (first day → 1, last day → D)
 *     - safeDaily divides by max(daysLeft + 1, 1), because today is still
 *       spendable (today + the daysLeft remaining days).
 *   This intentionally drops the `+1` from PLAN.md §1's elapsed formula, which
 *   could not satisfy both the first-day (elapsed=1) and last-day (daysLeft=0)
 *   edge cases at once.
 */

// ---------------------------------------------------------------------------
// Timezone-aware month window (the one place that touches wall-clock ↔ UTC)
// ---------------------------------------------------------------------------

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Wall-clock fields shown by `instant` in the given IANA timezone. */
function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const out: Record<string, number> = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour,
    minute: out.minute,
    second: out.second,
  };
}

/** Offset (ms) such that localWallClockAsUTC - offset = utcInstant, at `instant`. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - instant.getTime();
}

/** Convert a local wall-clock (midnight of y-mo-d in `timeZone`) to a UTC instant. */
function zonedMidnightToUtc(
  year: number,
  monthIndex: number,
  day: number,
  timeZone: string,
): Date {
  // Treat the wall-clock as if it were UTC, then correct by the zone offset.
  const guess = Date.UTC(year, monthIndex, day, 0, 0, 0);
  const offset1 = tzOffsetMs(new Date(guess), timeZone);
  let utc = guess - offset1;
  // Refine once: near a DST transition the offset at the corrected instant may differ.
  const offset2 = tzOffsetMs(new Date(utc), timeZone);
  if (offset2 !== offset1) utc = guess - offset2;
  return new Date(utc);
}

function parseMonth(month: string): { year: number; monthIndex: number } {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) throw new Error(`Invalid month '${month}', expected 'YYYY-MM'`);
  return { year: Number(m[1]), monthIndex: Number(m[2]) - 1 };
}

/**
 * UTC instants bounding a calendar month in the user's timezone:
 * [first-of-month 00:00 local, first-of-next-month 00:00 local). End is exclusive.
 */
export function monthWindow(
  month: string,
  timeZone: string,
): { startUtc: Date; endUtc: Date } {
  const { year, monthIndex } = parseMonth(month);
  const startUtc = zonedMidnightToUtc(year, monthIndex, 1, timeZone);
  const endUtc = zonedMidnightToUtc(year, monthIndex + 1, 1, timeZone);
  return { startUtc, endUtc };
}

/** Calendar days in the given 'YYYY-MM'. */
export function daysInMonth(month: string): number {
  const { year, monthIndex } = parseMonth(month);
  // Day 0 of the next month = last day of this month.
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Whole days remaining in `month` after today (0 .. D-1), evaluated in `timeZone`.
 * Before the month starts → D (all ahead); after it ends → 0.
 */
export function daysLeft(month: string, now: Date, timeZone: string): number {
  const D = daysInMonth(month);
  const { startUtc, endUtc } = monthWindow(month, timeZone);
  if (now.getTime() < startUtc.getTime()) return D;
  if (now.getTime() >= endUtc.getTime()) return 0;
  const todayDom = zonedParts(now, timeZone).day;
  return D - todayDom;
}

// ---------------------------------------------------------------------------
// Pure derived values (single currency, minor units)
// ---------------------------------------------------------------------------

/** Days elapsed including today: daysInMonth - daysLeft, clamped to >= 1. */
export function elapsedDays(daysInMonthValue: number, daysLeftValue: number): number {
  return Math.max(daysInMonthValue - daysLeftValue, 1);
}

/** What's left of the cap, never negative. */
export function remaining(cap: number, spent: number): number {
  return Math.max(cap - spent, 0);
}

/** Safe amount to spend per day for the rest of the month (today still spendable). */
export function safeDaily(remainingValue: number, daysLeftValue: number): number {
  return remainingValue / Math.max(daysLeftValue + 1, 1);
}

/** Where spending "should" be if spread evenly across the month so far. */
export function evenPace(cap: number, elapsed: number, daysInMonthValue: number): number {
  if (daysInMonthValue <= 0) return 0;
  return cap * (elapsed / daysInMonthValue);
}

/** Positive = under pace (warm), negative = ahead of pace (gentle nudge). */
export function paceGap(evenPaceValue: number, spent: number): number {
  return evenPaceValue - spent;
}

/** Month-end projection: "if today's rate were the whole month". */
export function projection(spent: number, elapsed: number, daysInMonthValue: number): number {
  return (spent / Math.max(elapsed, 1)) * daysInMonthValue;
}

/** Percent of cap spent, 0..100 (rounded). cap=0 → 100 if anything spent, else 0. */
export function spentPct(spent: number, cap: number): number {
  if (cap === 0) return spent > 0 ? 100 : 0;
  return Math.min(100, Math.round((spent / cap) * 100));
}
