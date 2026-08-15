import { getTranslations } from 'next-intl/server';
import { formatMoney } from '@/lib/format';
import type { Currency } from '@/lib/types';

type BarState = 'healthy' | 'nudge' | 'over';

const FILL: Record<BarState, string> = {
  healthy: 'bg-sage',
  nudge: 'bg-accent',
  over: 'bg-accent-700',
};

export async function SpentBar({
  spent,
  cap,
  spentPct,
  currency,
  state = 'healthy',
}: {
  spent: number;
  cap: number;
  spentPct: number;
  currency: Currency;
  state?: BarState;
}) {
  const t = await getTranslations('SpentBar');
  return (
    <div className="flex flex-col gap-2">
      <div className="h-4 rounded-full bg-sand-300 overflow-hidden">
        <div
          className={`h-full rounded-full ${FILL[state]} transition-[width]`}
          style={{ width: `${spentPct}%` }}
        />
      </div>
      <div className="flex justify-between text-sm text-ink/60">
        <span>
          <strong className="text-accent-700">
            {formatMoney(spent, currency)}
          </strong>{' '}
          {t('spent')}
        </span>
        <span>{t('of', { amount: formatMoney(cap, currency) })}</span>
      </div>
    </div>
  );
}
