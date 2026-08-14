import { formatMoney } from '@/lib/format';
import type { Currency } from '@/lib/types';

/**
 * The "nudge me at N%" banner — a gentle heads-up once spend crosses the
 * household's threshold but is still under the cap. Warm, never a warning.
 * Callers gate this on nudgeEnabled and the threshold; it always assumes it
 * should render.
 */
export function NudgeBanner({
  spentPct,
  remaining,
  safeDaily,
  currency,
}: {
  spentPct: number;
  remaining: number;
  safeDaily: number;
  currency: Currency;
}) {
  return (
    <div className="rounded-lg border border-accent/30 bg-accent/8 px-5 py-4">
      <p className="text-sm text-ink/80">
        <strong className="text-accent-700">{spentPct}% used</strong> — heads up,
        you&rsquo;re getting close. {formatMoney(remaining, currency)} left, so about{' '}
        <strong className="text-ink">
          {formatMoney(Math.round(safeDaily), currency)}
        </strong>{' '}
        a day carries you comfortably to the reset.
      </p>
    </div>
  );
}
