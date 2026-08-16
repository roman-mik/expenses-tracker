import { getTranslations } from 'next-intl/server';
import { formatMoney } from '@/lib/format';
import type { Category, Currency } from '@/lib/types';

interface Props {
  breakdown: { categoryId: string | null; spent: number }[];
  categories: Category[];
  currency: Currency;
  hasOtherCurrencies: boolean;
}

/** Whole-month category breakdown bar, unaffected by the `/history` category filter. */
export async function CategoryBreakdown({
  breakdown,
  categories,
  currency,
  hasOtherCurrencies,
}: Props) {
  const total = breakdown.reduce((sum, b) => sum + b.spent, 0);
  if (total === 0) return null;

  const t = await getTranslations('History');
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-2 w-full overflow-hidden rounded-sm">
        {breakdown.map(({ categoryId, spent }) => {
          const color = categoryMap.get(categoryId ?? '')?.color ?? 'sand-500';
          return (
            <div
              key={categoryId ?? 'uncategorized'}
              style={{
                flexGrow: spent,
                backgroundColor: `var(--color-${color})`,
              }}
            />
          );
        })}
      </div>

      <ul className="flex flex-col gap-1.5">
        {breakdown.map(({ categoryId, spent }) => {
          const category = categoryMap.get(categoryId ?? '');
          const color = category?.color ?? 'sand-500';
          const pct = Math.round((spent / total) * 100);
          return (
            <li
              key={categoryId ?? 'uncategorized'}
              className="flex items-center gap-2 text-sm"
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: `var(--color-${color})` }}
              />
              <span className="flex-1 text-ink/80">
                {category?.name ?? t('uncategorized')}
              </span>
              <span className="tabular-nums text-ink-muted">{pct}%</span>
              <span className="tabular-nums">
                {formatMoney(spent, currency)}
              </span>
            </li>
          );
        })}
      </ul>

      {hasOtherCurrencies ? (
        <p className="text-xs text-ink-muted">{t('otherCurrenciesNote')}</p>
      ) : null}
    </div>
  );
}
