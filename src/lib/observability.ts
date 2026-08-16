/**
 * A single seam for server-side error reporting. Not a replacement for a
 * real error tracker (no stack-trace grouping, no alerting) — Vercel Hobby's
 * Runtime Logs retain roughly an hour with no drains, so `console.error`
 * alone loses an overnight failure by morning. `track()` from
 * `@vercel/analytics/server` (already a dependency — see `error.tsx`'s
 * client-side use) puts a coarse, durable count of *how often* each context
 * fails in the Vercel dashboard, which survives past the log window even
 * though it can't show the error itself.
 *
 * `context` must stay a small, fixed set of call-site names — it's an
 * analytics event name, not free text, and Hobby caps custom events.
 * Never pass user data or the error message/stack into `properties`.
 */
import { track } from '@vercel/analytics/server';

export function reportError(context: string, error: unknown): void {
  console.error(context, error);
  // Best-effort only — a reporting failure must never affect the caller.
  // No-ops off Vercel (track() is documented as safe to call anywhere).
  void track('server_error', { context }).catch(() => {});
}
