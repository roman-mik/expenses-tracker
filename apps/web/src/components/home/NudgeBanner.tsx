import { getTranslations } from 'next-intl/server';
import { formatMoney } from '@/lib/format';
import type { Currency } from '@/lib/types';

/**
 * The "nudge me at N%" banner — a gentle heads-up once spend crosses the
 * household's threshold but is still under the cap. Warm, never a warning.
 * Callers gate this on nudgeEnabled and the threshold; it always assumes it
 * should render.
 */
export async function NudgeBanner({
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
  const t = await getTranslations('NudgeBanner');
  return (
    <div className="rounded-lg border border-accent/30 bg-accent/8 px-5 py-4">
      <p className="text-sm text-ink/80">
        {t.rich('message', {
          spentPct,
          remaining: formatMoney(remaining, currency),
          safeDaily: formatMoney(safeDaily, currency),
          pct: (chunks) => (
            <strong className="text-accent-700">{chunks}</strong>
          ),
          daily: (chunks) => <strong className="text-ink">{chunks}</strong>,
        })}
      </p>
    </div>
  );
}
