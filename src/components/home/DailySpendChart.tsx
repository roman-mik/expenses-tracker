import { getTranslations } from 'next-intl/server';
import { formatMoney } from '@/lib/format';
import type { Currency } from '@/lib/types';

interface Props {
  days: { dateKey: string; amountMinor: number }[];
  safeDaily: number;
  todayKey: string;
  currency: Currency;
}

/**
 * Hand-rolled CSS bars (no charting dependency — PLAN.md §2 explicitly allows
 * this) showing the month's daily spend against the safe-daily reference line.
 */
export async function DailySpendChart({
  days,
  safeDaily,
  todayKey,
  currency,
}: Props) {
  const t = await getTranslations('DailySpendChart');
  const max = Math.max(safeDaily, ...days.map((d) => d.amountMinor), 1);
  const linePct = Math.min(100, (safeDaily / max) * 100);

  const summary = t('ariaSummary', {
    amount: formatMoney(Math.round(safeDaily), currency),
  });

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
        {t('dailySpend')}
      </h2>

      <div
        role="img"
        aria-label={summary}
        className="relative flex h-32 items-end gap-[3px]"
      >
        <div
          aria-hidden
          className="absolute right-0 left-0 border-t border-dashed border-sage-600"
          style={{ bottom: `${linePct}%` }}
        >
          <span className="absolute -top-4 right-0 text-[10px] font-medium text-sage-700">
            {t('safePerDay')}
          </span>
        </div>

        {days.map((d) => {
          const isToday = d.dateKey === todayKey;
          const heightPct = Math.max(2, (d.amountMinor / max) * 100);
          const over = d.amountMinor > safeDaily;
          return (
            <div
              key={d.dateKey}
              title={`${d.dateKey}: ${formatMoney(d.amountMinor, currency)}`}
              className={`min-w-0 flex-1 rounded-t-sm transition-[height] ${
                over ? 'bg-accent-700' : 'bg-sage-500'
              } ${isToday ? 'ring-1 ring-inset ring-ink/40' : ''}`}
              style={{ height: `${heightPct}%` }}
            />
          );
        })}
      </div>

      <ul className="sr-only">
        {days.map((d) => (
          <li key={d.dateKey}>
            {d.dateKey}: {formatMoney(d.amountMinor, currency)}
          </li>
        ))}
      </ul>
    </div>
  );
}
