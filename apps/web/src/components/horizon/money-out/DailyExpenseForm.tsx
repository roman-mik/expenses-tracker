'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CURRENCIES, CURRENCY_EXPONENT, type Currency } from '@/lib/types';
import type { Category } from '@/lib/types';
import type { HorizonAccount } from '@/lib/horizon/types';
import {
  CHARGE_CADENCES,
  type ChargeCadence,
  type DailyExpense,
} from '@/lib/horizon/spending/types';
import { Button } from '@/components/ui/Button';

export interface DailyExpenseFormSubmitValues {
  accountId: string;
  pocketCategoryId?: string;
  name: string;
  currency: Currency;
  dailyAmountMinor: number;
  chargeCadence: ChargeCadence;
  capMinor?: number;
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

/** Create/edit form for a daily expense. Same idiom as `ObligationForm`. */
export function DailyExpenseForm({
  dailyExpense,
  accounts,
  categories,
  pending,
  onSubmit,
  onCancel,
}: {
  dailyExpense?: DailyExpense;
  accounts: HorizonAccount[];
  categories: Category[];
  pending: boolean;
  onSubmit: (values: DailyExpenseFormSubmitValues) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('Horizon.moneyOut');
  const tCommon = useTranslations('Common');
  const activeAccounts = accounts.filter((a) => !a.archived);
  const activeCategories = categories.filter((c) => !c.archived);

  const [name, setName] = useState(dailyExpense?.name ?? '');
  const [accountId, setAccountId] = useState(
    dailyExpense?.accountId ?? activeAccounts[0]?.id ?? ''
  );
  const [pocketCategoryId, setPocketCategoryId] = useState(
    dailyExpense?.pocketCategoryId ?? ''
  );
  const [currency, setCurrency] = useState<Currency>(
    dailyExpense?.currency ?? 'RSD'
  );
  const [dailyAmountMajor, setDailyAmountMajor] = useState(
    dailyExpense
      ? minorToMajor(dailyExpense.dailyAmountMinor, dailyExpense.currency)
      : ''
  );
  const [chargeCadence, setChargeCadence] = useState<ChargeCadence>(
    dailyExpense?.chargeCadence ?? 'daily'
  );
  const [capMajor, setCapMajor] = useState(
    dailyExpense?.capMinor != null
      ? minorToMajor(dailyExpense.capMinor, dailyExpense.currency)
      : ''
  );
  const [startDate, setStartDate] = useState(
    dailyExpense?.startDate ?? new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(dailyExpense?.endDate ?? '');

  const canSubmit =
    name.trim().length > 0 &&
    accountId.length > 0 &&
    startDate.length > 0 &&
    !pending &&
    Number(dailyAmountMajor.replace(',', '.')) > 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      accountId,
      pocketCategoryId: pocketCategoryId || undefined,
      name: name.trim(),
      currency,
      dailyAmountMinor: majorToMinor(dailyAmountMajor, currency),
      chargeCadence,
      capMinor: capMajor ? majorToMinor(capMajor, currency) : undefined,
      startDate,
      endDate: endDate || undefined,
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface p-4">
      <label>
        <span className="sr-only">{t('dailyExpenseNamePlaceholder')}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('dailyExpenseNamePlaceholder')}
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

      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        <span>{t('pocketCategoryLabel')}</span>
        <select
          value={pocketCategoryId}
          onChange={(e) => setPocketCategoryId(e.target.value)}
          className="w-full rounded-lg bg-bg px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40"
        >
          <option value="">{t('pocketCategoryNone')}</option>
          {activeCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

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
        <span>{t('dailyAmountLabel')}</span>
        <input
          value={dailyAmountMajor}
          onChange={(e) => setDailyAmountMajor(e.target.value)}
          inputMode="decimal"
          className="w-full rounded-lg bg-bg px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40"
        />
      </label>

      <div
        role="radiogroup"
        aria-label={t('cadenceLabel')}
        className="flex flex-wrap gap-2"
      >
        {CHARGE_CADENCES.map((c) => {
          const selected = c === chargeCadence;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setChargeCadence(c)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                selected
                  ? 'bg-accent-600 text-white'
                  : 'bg-bg text-ink-muted hover:bg-sand-300'
              }`}
            >
              {t(`cadence.${c}`)}
            </button>
          );
        })}
      </div>

      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        <span>{t('capLabel')}</span>
        <input
          value={capMajor}
          onChange={(e) => setCapMajor(e.target.value)}
          inputMode="decimal"
          className="w-full rounded-lg bg-bg px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40"
        />
      </label>

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
            : dailyExpense
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
