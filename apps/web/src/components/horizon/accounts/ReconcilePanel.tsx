'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { CURRENCY_EXPONENT, type Currency } from '@/lib/types';
import type { HorizonAccount } from '@/lib/horizon/types';
import { formatMoney } from '@/lib/format';
import { reconcileHorizonBalancesAction } from '@/app/actions/horizon-balances';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

function majorToMinor(major: string, currency: Currency): number {
  const n = Number(major.replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10 ** CURRENCY_EXPONENT[currency]);
}

function minorToMajor(minor: number, currency: Currency): string {
  return String(minor / 10 ** CURRENCY_EXPONENT[currency]);
}

export function ReconcilePanel({ accounts }: { accounts: HorizonAccount[] }) {
  const t = useTranslations('Horizon.accounts');
  const tCommon = useTranslations('Common');
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const activeAccounts = accounts
    .filter((a) => !a.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // State for user inputs per account
  const [formState, setFormState] = useState<
    Record<string, { major: string; note: string }>
  >({});

  if (activeAccounts.length === 0) return null;

  const getMajorValue = (acc: HorizonAccount) => {
    return (
      formState[acc.id]?.major ??
      minorToMajor(acc.currentBalanceMinor, acc.currency)
    );
  };

  const getNoteValue = (acc: HorizonAccount) => {
    return formState[acc.id]?.note ?? '';
  };

  const updateAccountInput = (
    accountId: string,
    field: 'major' | 'note',
    value: string
  ) => {
    setFormState((prev) => {
      const current = prev[accountId] ?? {
        major: minorToMajor(
          accounts.find((a) => a.id === accountId)?.currentBalanceMinor ?? 0,
          accounts.find((a) => a.id === accountId)?.currency ?? 'RSD'
        ),
        note: '',
      };
      return {
        ...prev,
        [accountId]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  const handleSubmit = () => {
    const entries = activeAccounts.map((acc) => {
      const majorStr = getMajorValue(acc);
      const balanceMinor = majorToMinor(majorStr, acc.currency);
      const note = getNoteValue(acc).trim();
      return {
        accountId: acc.id,
        balanceMinor,
        ...(note ? { note } : {}),
      };
    });

    startTransition(async () => {
      const result = await reconcileHorizonBalancesAction({
        balances: entries,
      });
      if (result.ok) {
        toast.success(t('reconcileSuccess'));
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  };

  if (!open) {
    return (
      <div className="mt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen(true)}
          className="w-full py-3"
        >
          {t('reconcileButton')}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-4 rounded-lg bg-surface p-4">
      <div>
        <h3 className="font-heading text-lg text-ink">{t('reconcileTitle')}</h3>
        <p className="text-xs text-ink-muted">{t('reconcileDescription')}</p>
      </div>

      <div className="flex flex-col gap-4 divide-y divide-sand-300/60">
        {activeAccounts.map((acc) => {
          const majorStr = getMajorValue(acc);
          const noteStr = getNoteValue(acc);
          const actualMinor = majorToMinor(majorStr, acc.currency);
          const varianceMinor = actualMinor - acc.currentBalanceMinor;

          return (
            <div key={acc.id} className="flex flex-col gap-2 pt-3 first:pt-0">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink/90">{acc.name}</span>
                <span className="text-xs text-ink-muted">
                  {t('expectedBalance')}:{' '}
                  {formatMoney(acc.currentBalanceMinor, acc.currency, {
                    withCurrency: true,
                  })}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs text-ink-muted">
                  <span>
                    {t('actualBalance')} ({acc.currency})
                  </span>
                  <input
                    value={majorStr}
                    onChange={(e) =>
                      updateAccountInput(acc.id, 'major', e.target.value)
                    }
                    placeholder="0"
                    inputMode="decimal"
                    className="w-full rounded-lg bg-bg px-3 py-1.5 text-sm text-ink outline-none focus:ring-2 focus:ring-accent/40"
                  />
                </label>

                <div className="flex flex-col gap-1 text-xs text-ink-muted justify-end">
                  <span>{t('variance')}</span>
                  <div
                    className={`flex items-center h-[34px] px-3 text-sm font-medium rounded-lg bg-bg ${
                      varianceMinor > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : varianceMinor < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-ink-muted'
                    }`}
                  >
                    {varianceMinor > 0 ? '+' : ''}
                    {formatMoney(varianceMinor, acc.currency, {
                      withCurrency: true,
                    })}
                  </div>
                </div>
              </div>

              <input
                value={noteStr}
                onChange={(e) =>
                  updateAccountInput(acc.id, 'note', e.target.value)
                }
                placeholder={t('notePlaceholder')}
                maxLength={500}
                className="w-full rounded-lg bg-bg px-3 py-1.5 text-xs text-ink outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={pending}
          className="px-4 py-2 text-sm"
        >
          {pending ? t('reconciling') : t('saveReconciliation')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="text-sm"
        >
          {tCommon('cancel')}
        </Button>
      </div>
    </div>
  );
}
