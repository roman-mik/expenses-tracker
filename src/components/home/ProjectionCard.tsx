import { formatMoney } from '@/lib/format';
import type { Currency } from '@/lib/types';

/**
 * Month-end projection: "if today's rate held all month." Suppressed for the
 * first few days — a projection off one or two data points swings wildly and a
 * scary early number would read as scolding, against the app's voice.
 */
const MIN_ELAPSED_DAYS = 3;

export function ProjectionCard({
  projection,
  cap,
  elapsedDays,
  currency,
}: {
  projection: number;
  cap: number;
  elapsedDays: number;
  currency: Currency;
}) {
  if (elapsedDays < MIN_ELAPSED_DAYS) return null;

  const over = projection > cap;
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-ink/60">At this rate, month-end lands near</span>
      <span
        className={`font-heading text-base ${over ? 'text-accent-700' : 'text-sage-700'}`}
      >
        {formatMoney(Math.round(projection), currency)}
      </span>
    </div>
  );
}
