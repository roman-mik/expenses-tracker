'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CURRENCIES, CURRENCY_EXPONENT, type Currency } from '@/lib/types';
import type {
  Confidence,
  HorizonAccount,
  Recurrence,
} from '@/lib/horizon/types';
import { CONFIDENCE_VALUES, RECURRENCE_VALUES } from '@/lib/horizon/types';
import {
  OBLIGATION_CATEGORIES,
  type Obligation,
  type ObligationCategory,
} from '@/lib/horizon/spending/types';
import { Button } from '@/components/ui/Button';

export interface ObligationFormSubmitValues {
  accountId: string;
  name: string;
  category: ObligationCategory;
  currency: Currency;
  amountMinor: number;
  recurrence: Recurrence;
  confidence: Confidence;
  startDate: string;
  endDate?: string;
}

function majorToMinor(major: string, currency: Currency): number {
  const n = Number(major.replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10 ** CURRENCY_EXPONENT[currency]);
}

function minorToMajor(minor: number, currency: Currency): string {
  return String(minor / 10 ** CURRENCY_EXPONENT[currency]);
}

/** Create/edit form for an obligation. Same idiom as `IncomeStreamForm`. */
export function ObligationForm({
  obligation,
  accounts,
  pending,
  onSubmit,
  onCancel,
}: {
  obligation?: Obligation;
  accounts: HorizonAccount[];
  pending: boolean;
  onSubmit: (values: ObligationFormSubmitValues) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('Horizon.moneyOut');
  const tCommon = useTranslations('Common');
  const activeAccounts = accounts.filter((a) => !a.archived);

  const [name, setName] = useState(obligation?.name ?? '');
  const [accountId, setAccountId] = useState(
    obligation?.accountId ?? activeAccounts[0]?.id ?? ''
  );
  const [category, setCategory] = useState<ObligationCategory>(
    obligation?.category ?? 'housing'
  );
  const [currency, setCurrency] = useState<Currency>(
    obligation?.currency ?? 'RSD'
  );
  const [amountMajor, setAmountMajor] = useState(
    obligation ? minorToMajor(obligation.amountMinor, obligation.currency) : ''
  );
  const [recurrence, setRecurrence] = useState<Recurrence>(
    obligation?.recurrence ?? 'recurring'
  );
  const [confidence, setConfidence] = useState<Confidence>(
    obligation?.confidence ?? 'confirmed'
  );
  const [startDate, setStartDate] = useState(
    obligation?.startDate ?? new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(obligation?.endDate ?? '');

  const canSubmit =
    name.trim().length > 0 &&
    accountId.length > 0 &&
    startDate.length > 0 &&
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
      recurrence,
      confidence,
      startDate,
      endDate: endDate || undefined,
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface p-4">
      <label>
        <span className="sr-only">{t('namePlaceholder')}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('namePlaceholder')}
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
        aria-label={t('categoryLabel')}
        className="flex flex-wrap gap-2"
      >
        {OBLIGATION_CATEGORIES.map((c) => {
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
              {t(`category.${c}`)}
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

      <div
        role="radiogroup"
        aria-label={t('recurrenceLabel')}
        className="flex flex-wrap gap-2"
      >
        {RECURRENCE_VALUES.map((r) => {
          const selected = r === recurrence;
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setRecurrence(r)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                selected
                  ? 'bg-accent-600 text-white'
                  : 'bg-bg text-ink-muted hover:bg-sand-300'
              }`}
            >
              {t(`recurrence.${r}`)}
            </button>
          );
        })}
      </div>

      <div
        role="radiogroup"
        aria-label={t('confidenceLabel')}
        className="flex flex-wrap gap-2"
      >
        {CONFIDENCE_VALUES.map((c) => {
          const selected = c === confidence;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setConfidence(c)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                selected
                  ? 'bg-accent-600 text-white'
                  : 'bg-bg text-ink-muted hover:bg-sand-300'
              }`}
            >
              {t(`confidence.${c}`)}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          <span>{t('startDateLabel')}</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-lg bg-bg px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          <span>{t('endDateLabel')}</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-lg bg-bg px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="px-4 py-2 text-sm"
        >
          {pending
            ? tCommon('saving')
            : obligation
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
