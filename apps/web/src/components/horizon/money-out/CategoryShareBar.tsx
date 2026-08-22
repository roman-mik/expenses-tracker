'use client';

import { useTranslations } from 'next-intl';
import { formatMoney } from '@/lib/format';
import type { Currency } from '@/lib/types';
import type { CategoryShare } from '@/lib/horizon/spending/spending-math';

const CATEGORY_COLORS: Record<string, string> = {
  housing: 'bg-accent-600',
  utilities: 'bg-sky-500',
  debt: 'bg-rose-500',
  subscriptions: 'bg-amber-500',
  insurance: 'bg-emerald-500',
  transport: 'bg-indigo-500',
  family: 'bg-fuchsia-500',
  other: 'bg-sand-400',
};

/**
 * C7's category grouping bar: one proportional segment per category, whose
 * widths always sum to 100% (`categoryShares`' `sharePct` already excludes
 * rows with no usable FX rate from the denominator).
 */
export function CategoryShareBar({
  shares,
  reportingCurrency,
}: {
  shares: CategoryShare[];
  reportingCurrency: Currency;
}) {
  const t = useTranslations('Horizon.moneyOut');

  if (shares.length === 0) return null;

  const sorted = [...shares].sort((a, b) => b.totalMinor - a.totalMinor);

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
        {t('shareBar.title')}
      </h2>
      <div
        role="img"
        aria-label={t('shareBar.title')}
        className="flex h-3 w-full overflow-hidden rounded-full bg-bg"
      >
        {sorted.map((s) => (
          <div
            key={s.category}
            title={`${t(`category.${s.category}`)} ${s.sharePct.toFixed(0)}%`}
            className={CATEGORY_COLORS[s.category] ?? 'bg-sand-400'}
            style={{ width: `${s.sharePct}%` }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
        {sorted.map((s) => (
          <li key={s.category} className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${CATEGORY_COLORS[s.category] ?? 'bg-sand-400'}`}
            />
            <span>
              {t(`category.${s.category}`)} · {s.sharePct.toFixed(0)}% (
              {formatMoney(s.totalMinor, reportingCurrency, {
                withCurrency: true,
              })}
              )
            </span>
            {s.hasMissingRate ? (
              <span className="text-accent-700">
                {t('shareBar.missingRate')}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
