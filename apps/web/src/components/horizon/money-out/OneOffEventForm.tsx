'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CURRENCIES, CURRENCY_EXPONENT, type Currency } from '@/lib/types';
import type { HorizonAccount } from '@/lib/horizon/types';
import {
  ONE_OFF_CATEGORIES,
  ONE_OFF_DIRECTIONS,
  type OneOffCategory,
  type OneOffDirection,
  type OneOffEvent,
} from '@/lib/horizon/spending/types';
import { Button } from '@/components/ui/Button';

export interface OneOffEventFormSubmitValues {
  accountId: string;
  name: string;
  category: OneOffCategory;
  currency: Currency;
  amountMinor: number;
  date: string;
  direction: OneOffDirection;
}

function majorToMinor(major: string, currency: Currency): number {
  const n = Number(major.replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10 ** CURRENCY_EXPONENT[currency]);
}

function minorToMajor(minor: number, currency: Currency): string {
  return String(minor / 10 ** CURRENCY_EXPONENT[currency]);
}

/** Create/edit form for a one-off event. Same idiom as `ObligationForm`. */
export function OneOffEventForm({
  oneOffEvent,
  accounts,
  pending,
  onSubmit,
  onCancel,
}: {
  oneOffEvent?: OneOffEvent;
  accounts: HorizonAccount[];
  pending: boolean;
  onSubmit: (values: OneOffEventFormSubmitValues) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('Horizon.moneyOut');
  const tCommon = useTranslations('Common');
  const activeAccounts = accounts.filter((a) => !a.archived);

  const [name, setName] = useState(oneOffEvent?.name ?? '');
  const [accountId, setAccountId] = useState(
    oneOffEvent?.accountId ?? activeAccounts[0]?.id ?? ''
  );
  const [category, setCategory] = useState<OneOffCategory>(
    oneOffEvent?.category ?? 'other'
  );
  const [currency, setCurrency] = useState<Currency>(
    oneOffEvent?.currency ?? 'RSD'
  );
  const [amountMajor, setAmountMajor] = useState(
    oneOffEvent
      ? minorToMajor(oneOffEvent.amountMinor, oneOffEvent.currency)
      : ''
  );
  const [date, setDate] = useState(
    oneOffEvent?.date ?? new Date().toISOString().slice(0, 10)
  );
  const [direction, setDirection] = useState<OneOffDirection>(
    oneOffEvent?.direction ?? 'out'
  );

  const canSubmit =
    name.trim().length > 0 &&
    accountId.length > 0 &&
    date.length > 0 &&
    !pending &&
    Number(amountMajor.replace(',', '.')) > 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      accountId,
      name: name.trim(),
      category,
      currency,
      amountMinor: majorToMinor(amountMajor, currency),
      date,
      direction,
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface p-4">
      <label>
        <span className="sr-only">{t('oneOffNamePlaceholder')}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('oneOffNamePlaceholder')}
          maxLength={60}
          className="w-full rounded-lg bg-bg px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40"
          autoFocus
        />
      </label>

      <label>
        <span className="sr-only">{t('accountLabel')}</span>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="w-full rounded-lg bg-bg px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40"
        >
          {activeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      <div
        role="radiogroup"
        aria-label={t('directionLabel')}
        className="flex flex-wrap gap-2"
      >
        {ONE_OFF_DIRECTIONS.map((d) => {
          const selected = d === direction;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setDirection(d)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                selected
                  ? 'bg-accent-600 text-white'
                  : 'bg-bg text-ink-muted hover:bg-sand-300'
              }`}
            >
              {t(`direction.${d}`)}
            </button>
          );
        })}
      </div>

      <div
        role="radiogroup"
        aria-label={t('categoryLabel')}
        className="flex flex-wrap gap-2"
      >
        {ONE_OFF_CATEGORIES.map((c) => {
          const selected = c === category;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setCategory(c)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                selected
                  ? 'bg-accent-600 text-white'
                  : 'bg-bg text-ink-muted hover:bg-sand-300'
              }`}
            >
              {t(`oneOffCategory.${c}`)}
            </button>
          );
        })}
      </div>

      <div
        role="radiogroup"
        aria-label={t('currencyLabel')}
        className="flex flex-wrap gap-2"
      >
        {CURRENCIES.map((c) => {
          const selected = c === currency;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setCurrency(c)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                selected
                  ? 'bg-accent-600 text-white'
                  : 'bg-bg text-ink-muted hover:bg-sand-300'
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>

      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        <span>{t('amountLabel')}</span>
        <input
          value={amountMajor}
          onChange={(e) => setAmountMajor(e.target.value)}
          inputMode="decimal"
          className="w-full rounded-lg bg-bg px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        <span>{t('dateLabel')}</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg bg-bg px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40"
        />
      </label>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="px-4 py-2 text-sm"
        >
          {pending
            ? tCommon('saving')
            : oneOffEvent
              ? tCommon('save')
              : t('add')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={pending}
          className="text-sm"
        >
          {tCommon('cancel')}
        </Button>
      </div>
    </div>
  );
}
