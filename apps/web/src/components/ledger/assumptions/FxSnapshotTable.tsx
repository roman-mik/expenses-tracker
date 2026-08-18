'use client';

import { useTranslations } from 'next-intl';
import type { FxRate } from '@/lib/ledger/types';
import { isStale, rateAgeDays } from '@/lib/ledger/fx';

function formatRate(rateE8: number): string {
  const num = rateE8 / 1e8;
  return num >= 1 ? num.toFixed(4) : num.toFixed(6);
}

export function FxSnapshotTable({
  rates,
  today,
}: {
  rates: FxRate[];
  today?: string;
}) {
  const t = useTranslations('Ledger.assumptions');
  const currentDate = today ?? new Date().toISOString().slice(0, 10);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          {t('fxRatesTitle')}
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          {t('fxRatesDescription')}
        </p>
      </div>

      {rates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-text-muted">
          {t('noRatesYet')}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-text-muted">
                <th scope="col" className="pb-3 font-medium">
                  {t('pair')}
                </th>
                <th scope="col" className="pb-3 font-medium">
                  {t('rate')}
                </th>
                <th scope="col" className="pb-3 font-medium">
                  {t('asOfDate')}
                </th>
                <th scope="col" className="pb-3 font-medium">
                  {t('source')}
                </th>
                <th scope="col" className="pb-3 font-medium">
                  {t('age')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rates.map((r) => {
                const age = rateAgeDays(r.asOfDate, currentDate);
                const stale = isStale(r.asOfDate, currentDate);

                return (
                  <tr
                    key={`${r.baseCode}-${r.quoteCode}-${r.asOfDate}`}
                    className="hover:bg-bg/50 transition-colors"
                  >
                    <td className="py-3 font-medium text-text-primary">
                      {r.baseCode} → {r.quoteCode}
                    </td>
                    <td className="py-3 font-mono text-text-primary">
                      1 {r.baseCode} = {formatRate(r.rateE8)} {r.quoteCode}
                    </td>
                    <td className="py-3 text-text-muted">{r.asOfDate}</td>
                    <td className="py-3 text-text-muted">{r.source}</td>
                    <td className="py-3">
                      {stale ? (
                        <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-500">
                          {t('staleBadge')}
                        </span>
                      ) : age === 0 ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-500">
                          {t('todayBadge')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-bg px-2.5 py-0.5 text-xs font-medium text-text-muted border border-border">
                          {t('daysOldBadge', { days: age })}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
