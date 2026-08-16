import { getTranslations } from 'next-intl/server';
import { formatMoney } from '@/lib/format';
import type { Currency } from '@/lib/types';

/**
 * Warm, never-scolding pace copy driven by `paceGap`:
 *   positive = under an even pace (sage "you're fine" voice)
 *   negative = ahead of pace (a gentle nudge, still kind)
 *   zero     = right on pace
 * Only the under-cap states render this; over-cap swaps in RecoveryPlan.
 */
export async function PaceLine({
  paceGap,
  currency,
}: {
  paceGap: number;
  currency: Currency;
}) {
  const t = await getTranslations('PaceLine');
  if (paceGap > 0) {
    return (
      <p className="text-sm text-sage-700">
        {t('underPace', { amount: formatMoney(paceGap, currency) })}
      </p>
    );
  }
  if (paceGap < 0) {
    return (
      <p className="text-sm text-accent-700">
        {t('overPace', { amount: formatMoney(-paceGap, currency) })}
      </p>
    );
  }
  return <p className="text-sm text-ink-muted">{t('onPace')}</p>;
}
