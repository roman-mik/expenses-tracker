'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { CURRENCIES, type Currency } from '@/lib/types';
import { setHorizonReportingCurrency } from '@/app/actions/horizon-settings';
import { useToast } from '@/components/ui/Toast';

export function ReportingCurrencyPicker({
  initialCurrency,
}: {
  initialCurrency: Currency;
}) {
  const t = useTranslations('Horizon.assumptions');
  const toast = useToast();
  const [selectedCurrency, setSelectedCurrency] =
    useState<Currency>(initialCurrency);
  const [isPending, startTransition] = useTransition();

  const handleSelect = (c: Currency) => {
    if (c === selectedCurrency || isPending) return;
    const previous = selectedCurrency;
    setSelectedCurrency(c);

    startTransition(async () => {
      const res = await setHorizonReportingCurrency({ reportingCurrency: c });
      if (!res.ok) {
        setSelectedCurrency(previous);
        toast.error(res.error);
      } else {
        toast.success(t('settingsSaved'));
      }
    });
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          {t('reportingCurrencyTitle')}
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          {t('reportingCurrencyDescription')}
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label={t('reportingCurrencyTitle')}
        className="flex flex-wrap gap-3"
      >
        {CURRENCIES.map((c) => {
          const isSelected = c === selectedCurrency;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={isPending}
              onClick={() => handleSelect(c)}
              className={`flex h-11 min-w-24 items-center justify-center rounded-lg border px-4 text-sm font-medium transition-all ${
                isSelected
                  ? 'border-accent bg-accent/10 text-accent ring-2 ring-accent/30'
                  : 'border-border bg-bg text-text-muted hover:border-text-muted hover:text-text-primary'
              } disabled:opacity-50`}
            >
              {c}
            </button>
          );
        })}
      </div>
    </section>
  );
}
