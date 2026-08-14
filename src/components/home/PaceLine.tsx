import { formatMoney } from '@/lib/format';
import type { Currency } from '@/lib/types';

/**
 * Warm, never-scolding pace copy driven by `paceGap`:
 *   positive = under an even pace (sage "you're fine" voice)
 *   negative = ahead of pace (a gentle nudge, still kind)
 *   zero     = right on pace
 * Only the under-cap states render this; over-cap swaps in RecoveryPlan.
 */
export function PaceLine({
  paceGap,
  currency,
}: {
  paceGap: number;
  currency: Currency;
}) {
  if (paceGap > 0) {
    return (
      <p className="text-sm text-sage-700">
        Nicely paced — you&rsquo;re {formatMoney(paceGap, currency)} under an even
        month. Nothing to fix today.
      </p>
    );
  }
  if (paceGap < 0) {
    return (
      <p className="text-sm text-accent-700">
        A touch ahead of pace — about {formatMoney(-paceGap, currency)} over an
        even month. Easy to ease back.
      </p>
    );
  }
  return (
    <p className="text-sm text-ink/60">
      Right on an even pace for the month.
    </p>
  );
}
