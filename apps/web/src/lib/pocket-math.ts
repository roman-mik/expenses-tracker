/**
 * pocket-math — the derived-value formulas that power Pocket.
 *
 * Pure functions, no I/O, currency-agnostic: every amount is an integer in
 * minor units of a SINGLE currency. Callers must not mix currencies here.
 *
 * `daysLeft` convention (IMPORTANT — the whole formula suite depends on it):
 *   `daysLeft` counts whole days remaining in the month EXCLUDING today,
 *   so it ranges 0 .. D-1 and matches the product's "N days until reset"
 *   countdown. Two different day-counts fall out of it, for two different
 *   purposes — conflating them was a real bug here (a user spending exactly
 *   the even pace was told "right on pace" AND handed a safe-daily ~4.5%
 *   below cap/D, because the two spans summed to D+1, one day too many):
 *     - elapsedDays = daysInMonth - daysLeft, clamped ≥ 1 (first day → 1,
 *       last day → D). Today counts as elapsed. Used by `projection`, which
 *       wants "spend so far ÷ days that produced it" and treats today's
 *       partial spend as a data point.
 *     - completedDays = daysInMonth - daysLeft - 1, clamped ≥ 0 (first day →
 *       0, last day → D-1). Today does NOT count as completed. Used by
 *       `evenPace`, the pace *baseline* — today hasn't happened yet from the
 *       baseline's point of view.
 *     - safeDaily divides by max(daysLeft + 1, 1), because today is still
 *       spendable (today + the daysLeft remaining days).
 *   completedDays + (daysLeft + 1) === daysInMonth for every daysLeft, which
 *   is what makes safeDaily and evenPace reconcile: a user spending exactly
 *   evenPace always has safeDaily === floor(cap / D).
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
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const out: Record<string, number> = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
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
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second
  );
  return asUtc - instant.getTime();
}

/** Convert a local wall-clock (midnight of y-mo-d in `timeZone`) to a UTC instant. */
function zonedMidnightToUtc(
  year: number,
  monthIndex: number,
  day: number,
  timeZone: string
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
  timeZone: string
): { startUtc: Date; endUtc: Date } {
  const { year, monthIndex } = parseMonth(month);
  const startUtc = zonedMidnightToUtc(year, monthIndex, 1, timeZone);
  const endUtc = zonedMidnightToUtc(year, monthIndex + 1, 1, timeZone);
  return { startUtc, endUtc };
}

/** The current calendar month ('YYYY-MM') as seen in `timeZone`. */
export function currentMonth(now: Date, timeZone: string): string {
  const { year, month } = zonedParts(now, timeZone);
  return `${year}-${String(month).padStart(2, '0')}`;
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
export function elapsedDays(
  daysInMonthValue: number,
  daysLeftValue: number
): number {
  return Math.max(daysInMonthValue - daysLeftValue, 1);
}

/**
 * Days fully completed BEFORE today: daysInMonth - daysLeft - 1, clamped to
 * >= 0. The pace baseline — unlike `elapsedDays`, today does not count, since
 * today's spending isn't "behind" or "ahead" of anything yet. See the module
 * header for why this must stay distinct from `elapsedDays`.
 */
export function completedDays(
  daysInMonthValue: number,
  daysLeftValue: number
): number {
  return Math.max(daysInMonthValue - daysLeftValue - 1, 0);
}

/** What's left of the cap, never negative. */
export function remaining(cap: number, spent: number): number {
  return Math.max(cap - spent, 0);
}

/**
 * Safe amount to spend per day for the rest of the month (today still
 * spendable). Floors to whole minor units — a rounded-up allowance can, when
 * followed exactly, add up to more than what's actually remaining.
 */
export function safeDaily(
  remainingValue: number,
  daysLeftValue: number
): number {
  return Math.floor(remainingValue / Math.max(daysLeftValue + 1, 1));
}

/** Where spending "should" be if spread evenly across the days completed so far. */
export function evenPace(
  cap: number,
  completed: number,
  daysInMonthValue: number
): number {
  if (daysInMonthValue <= 0) return 0;
  return (cap * completed) / daysInMonthValue;
}

/** Positive = under pace (warm), negative = ahead of pace (gentle nudge). */
export function paceGap(evenPaceValue: number, spent: number): number {
  return evenPaceValue - spent;
}

/** Month-end projection: "if today's rate were the whole month". */
export function projection(
  spent: number,
  elapsed: number,
  daysInMonthValue: number
): number {
  return (spent / Math.max(elapsed, 1)) * daysInMonthValue;
}

/** Percent of cap spent, 0..100 (rounded). cap=0 → 100 if anything spent, else 0. */
export function spentPct(spent: number, cap: number): number {
  if (cap === 0) return spent > 0 ? 100 : 0;
  return Math.min(100, Math.round((spent / cap) * 100));
}

/** How far past the cap this month's spend is; 0 while still under or exactly at cap. */
export function overspend(cap: number, spent: number): number {
  return Math.max(spent - cap, 0);
}

/**
 * Forward-looking recovery target: the cap that, if adopted next month, absorbs
 * this month's overspend in one month so the two months net even. Never below 0.
 * (A gentle suggestion — the design never forces a lower cap.)
 */
export function recoveryCap(cap: number, overspendValue: number): number {
  return Math.max(cap - overspendValue, 0);
}
