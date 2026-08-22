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
import type {
  IncomeStream,
  IncomeStreamKind,
} from '@/lib/horizon/income/types';
import { Button } from '@/components/ui/Button';

const STREAM_KINDS: IncomeStreamKind[] = ['hourly', 'fixed', 'variable'];

export interface IncomeStreamFormSubmitValues {
  kind: IncomeStreamKind;
  accountId: string;
  name: string;
  currency: Currency;
  recurrence: Recurrence;
  confidence: Confidence;
  taxable: boolean;
  startDate: string;
  endDate?: string;
  hourlyRateMinor?: number;
  hoursPerDay?: number;
  fixedAmountMinor?: number;
}

function majorToMinor(major: string, currency: Currency): number {
  const n = Number(major.replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10 ** CURRENCY_EXPONENT[currency]);
}

function minorToMajor(minor: number, currency: Currency): string {
  return String(minor / 10 ** CURRENCY_EXPONENT[currency]);
}

/**
 * Create/edit form for an income stream. `kind` is fixed once a stream
 * exists (validation.ts's `incomeStreamUpdateSchema` has no kind field) —
 * changing it means deleting and recreating the stream.
 */
export function IncomeStreamForm({
  stream,
  accounts,
  pending,
  onSubmit,
  onCancel,
}: {
  stream?: IncomeStream;
  accounts: HorizonAccount[];
  pending: boolean;
  onSubmit: (values: IncomeStreamFormSubmitValues) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('Horizon.moneyIn');
  const tCommon = useTranslations('Common');
  const activeAccounts = accounts.filter((a) => !a.archived);

  const [kind, setKind] = useState<IncomeStreamKind>(stream?.kind ?? 'hourly');
  const [name, setName] = useState(stream?.name ?? '');
  const [accountId, setAccountId] = useState(
    stream?.accountId ?? activeAccounts[0]?.id ?? ''
  );
  const [currency, setCurrency] = useState<Currency>(stream?.currency ?? 'RSD');
  const [recurrence, setRecurrence] = useState<Recurrence>(
    stream?.recurrence ?? 'recurring'
  );
  const [confidence, setConfidence] = useState<Confidence>(
    stream?.confidence ?? 'confirmed'
  );
  const [taxable, setTaxable] = useState(stream?.taxable ?? true);
  const [startDate, setStartDate] = useState(
    stream?.startDate ?? new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(stream?.endDate ?? '');

  const [hourlyRateMajor, setHourlyRateMajor] = useState(
    stream?.kind === 'hourly'
      ? minorToMajor(stream.hourlyRateMinor, stream.currency)
      : ''
  );
  const [hoursPerDay, setHoursPerDay] = useState(
    stream?.kind === 'hourly' ? String(stream.hoursPerDay) : '8'
  );
  const [fixedAmountMajor, setFixedAmountMajor] = useState(
    stream && stream.kind !== 'hourly'
      ? minorToMajor(stream.fixedAmountMinor, stream.currency)
      : ''
  );

  const canSubmit =
    name.trim().length > 0 &&
    accountId.length > 0 &&
    startDate.length > 0 &&
    !pending &&
    (kind === 'hourly'
      ? Number(hourlyRateMajor.replace(',', '.')) > 0 &&
        Number(hoursPerDay.replace(',', '.')) > 0
      : Number(fixedAmountMajor.replace(',', '.')) !== 0 ||
        fixedAmountMajor.trim().length > 0);

  const submit = () => {
    if (!canSubmit) return;
    const base = {
      accountId,
      name: name.trim(),
      currency,
      recurrence,
      confidence,
      taxable,
      startDate,
      endDate: endDate || undefined,
    };
    if (kind === 'hourly') {
      onSubmit({
        ...base,
        kind: 'hourly',
        hourlyRateMinor: majorToMinor(hourlyRateMajor, currency),
        hoursPerDay: Number(hoursPerDay.replace(',', '.')),
      });
    } else {
      onSubmit({
        ...base,
        kind,
        fixedAmountMinor: majorToMinor(fixedAmountMajor, currency),
      });
    }
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

      {!stream ? (
        <div
          role="radiogroup"
          aria-label={t('kindLabel')}
          className="flex flex-wrap gap-2"
        >
          {STREAM_KINDS.map((k) => {
            const selected = k === kind;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setKind(k)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  selected
                    ? 'bg-accent-600 text-white'
                    : 'bg-bg text-ink-muted hover:bg-sand-300'
                }`}
              >
                {t(`kind.${k}`)}
              </button>
            );
          })}
        </div>
      ) : null}

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

      {kind === 'hourly' ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            <span>{t('hourlyRateLabel')}</span>
            <input
              value={hourlyRateMajor}
              onChange={(e) => setHourlyRateMajor(e.target.value)}
              inputMode="decimal"
              className="w-full rounded-lg bg-bg px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            <span>{t('hoursPerDayLabel')}</span>
            <input
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(e.target.value)}
              inputMode="decimal"
              className="w-full rounded-lg bg-bg px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>
        </div>
      ) : (
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          <span>{t('fixedAmountLabel')}</span>
          <input
            value={fixedAmountMajor}
            onChange={(e) => setFixedAmountMajor(e.target.value)}
            inputMode="decimal"
            className="w-full rounded-lg bg-bg px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
      )}

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

      <label className="flex items-center gap-2 text-sm text-ink-muted">
        <input
          type="checkbox"
          checked={taxable}
          onChange={(e) => setTaxable(e.target.checked)}
        />
        {t('taxable')}
      </label>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="px-4 py-2 text-sm"
        >
          {pending ? tCommon('saving') : stream ? tCommon('save') : t('add')}
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
