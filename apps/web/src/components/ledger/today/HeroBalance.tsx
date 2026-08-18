import { getTranslations } from 'next-intl/server';
import { formatMoney } from '@/lib/format';
import type { Currency } from '@/lib/types';

/** The one-glance number: everything `includeInTotal`, converted into the reporting currency. */
export async function HeroBalance({
  totalMinor,
  currency,
  hasMissingRate,
}: {
  totalMinor: number;
  currency: Currency;
  hasMissingRate: boolean;
}) {
  const t = await getTranslations('Ledger.today');

  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-surface p-8">
      <span className="text-sm text-ink-muted">{t('heroLabel')}</span>
      <div className="flex items-baseline gap-2">
        <span className="font-heading text-5xl">
          {formatMoney(totalMinor, currency)}
        </span>
        <span className="font-semibold text-ink-muted">{currency}</span>
      </div>
      {hasMissingRate && (
        <p className="text-sm text-accent-700">{t('missingRateNote')}</p>
      )}
    </div>
  );
}
