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
