'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CURRENCIES, CURRENCY_EXPONENT, type Currency } from '@/lib/types';
import {
  ACCOUNT_TYPES,
  type AccountType,
  type HorizonAccount,
} from '@/lib/horizon/types';
import { Button } from '@/components/ui/Button';

export interface AccountFormSubmitValues {
  name: string;
  currency: Currency;
  type: AccountType;
  currentBalanceMinor: number;
  includeInTotal: boolean;
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
 * Create/edit form for a horizon account — name, currency, type, starting
 * balance (may be negative: overdraft), and whether it counts toward the
 * Today hero total. Shared by `AccountList`'s "add" flow and its per-row
 * edit flow, since both need the same five fields.
 */
export function AccountForm({
  account,
  pending,
  onSubmit,
  onCancel,
}: {
  account?: HorizonAccount;
  pending: boolean;
  onSubmit: (values: AccountFormSubmitValues) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('Horizon.accounts');
  const tCommon = useTranslations('Common');
  const [name, setName] = useState(account?.name ?? '');
  const [currency, setCurrency] = useState<Currency>(
    account?.currency ?? 'RSD'
  );
  const [type, setType] = useState<AccountType>(account?.type ?? 'personal');
  const [balanceMajor, setBalanceMajor] = useState(
    account ? minorToMajor(account.currentBalanceMinor, account.currency) : ''
  );
  const [includeInTotal, setIncludeInTotal] = useState(
    account?.includeInTotal ?? true
  );

  const canSubmit = name.trim().length > 0 && !pending;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      name: name.trim(),
      currency,
      type,
      currentBalanceMinor: majorToMinor(balanceMajor, currency),
      includeInTotal,
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

      <div
        role="radiogroup"
        aria-label={t('typeLabel')}
        className="flex flex-wrap gap-2"
      >
        {ACCOUNT_TYPES.map((accountType) => {
          const selected = accountType === type;
          return (
            <button
              key={accountType}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setType(accountType)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                selected
                  ? 'bg-accent-600 text-white'
                  : 'bg-bg text-ink-muted hover:bg-sand-300'
              }`}
            >
              {t(`type.${accountType}`)}
            </button>
          );
        })}
      </div>

      <label>
        <span className="sr-only">{t('balancePlaceholder')}</span>
        <input
          value={balanceMajor}
          onChange={(e) => setBalanceMajor(e.target.value)}
          placeholder={t('balancePlaceholder')}
          inputMode="decimal"
          className="w-full rounded-lg bg-bg px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-ink-muted">
        <input
          type="checkbox"
          checked={includeInTotal}
          onChange={(e) => setIncludeInTotal(e.target.checked)}
        />
        {t('includeInTotal')}
      </label>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="px-4 py-2 text-sm"
        >
          {pending ? tCommon('saving') : account ? tCommon('save') : t('add')}
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
