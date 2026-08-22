'use client';

import { useTranslations } from 'next-intl';
import { formatMoney } from '@/lib/format';
import type { DailyExpense } from '@/lib/horizon/spending/types';
import {
  dailyExpenseForMonth,
  monthLengthVariants,
} from '@/lib/horizon/spending/spending-math';

/**
 * C4's cap tracker: for every daily expense with a `capMinor` set, the
 * planned total for the given month next to Pocket's actual spend so far,
 * plus the 28/30/31-day reference variants. `actuals` is keyed by daily
 * expense id and comes from `sumPocketExpenses`, called server-side.
 */
export function CapTracker({
  dailyExpenses,
  month,
  actuals,
}: {
  dailyExpenses: DailyExpense[];
  month: string;
  actuals: Record<string, number>;
}) {
  const t = useTranslations('Horizon.moneyOut');

  const capped = dailyExpenses.filter((d) => !d.archived && d.capMinor != null);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
        {t('capTracker.title')}
      </h2>

      {capped.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('capTracker.noneYet')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-sand-300/60">
          {capped.map((d) => {
            const cap = d.capMinor as number;
            const planned = dailyExpenseForMonth(d.dailyAmountMinor, month);
            const variants = monthLengthVariants(d.dailyAmountMinor);
            const actual = actuals[d.id] ?? 0;
            const overCap = actual > cap;

            return (
              <li key={d.id} className="flex flex-col gap-1 py-3">
                <span className="text-ink/80">{d.name}</span>
                <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
                  <span>
                    {t('capTracker.plannedLabel')}:{' '}
                    {formatMoney(planned, d.currency, { withCurrency: true })}
                  </span>
                  <span
                    className={
                      overCap ? 'font-medium text-accent-700' : undefined
                    }
                  >
                    {t('capTracker.actualLabel')}:{' '}
                    {formatMoney(actual, d.currency, { withCurrency: true })}
                  </span>
                  <span>
                    {t('capTracker.capLabel')}:{' '}
                    {formatMoney(cap, d.currency, { withCurrency: true })}
                  </span>
                </span>
                <span className="text-xs text-ink-muted">
                  {t('capTracker.variantsLabel')}:{' '}
                  {formatMoney(variants.d28, d.currency)} /{' '}
                  {formatMoney(variants.d30, d.currency)} /{' '}
                  {formatMoney(variants.d31, d.currency)}
                </span>
                {overCap ? (
                  <span className="w-fit rounded-full bg-accent-700 px-2 py-0.5 text-xs font-medium text-white">
                    {t('capTracker.overCap')}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
