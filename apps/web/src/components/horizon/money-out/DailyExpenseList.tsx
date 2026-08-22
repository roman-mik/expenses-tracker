'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { Category } from '@/lib/types';
import type { HorizonAccount } from '@/lib/horizon/types';
import type { DailyExpense } from '@/lib/horizon/spending/types';
import { formatMoney } from '@/lib/format';
import {
  addDailyExpense,
  editDailyExpense,
} from '@/app/actions/horizon-spending';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { TrashIcon } from '@/components/ui/icons';
import {
  DailyExpenseForm,
  type DailyExpenseFormSubmitValues,
} from './DailyExpenseForm';

function DailyExpenseRow({
  dailyExpense,
  accounts,
  categories,
}: {
  dailyExpense: DailyExpense;
  accounts: HorizonAccount[];
  categories: Category[];
}) {
  const t = useTranslations('Horizon.moneyOut');
  const tCommon = useTranslations('Common');
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'archive' | 'restore'>(null);

  const account = accounts.find((a) => a.id === dailyExpense.accountId);
  const category = categories.find(
    (c) => c.id === dailyExpense.pocketCategoryId
  );

  const save = (values: DailyExpenseFormSubmitValues) => {
    setBusy('save');
    startTransition(async () => {
      const result = await editDailyExpense(dailyExpense.id, values);
      if (result.ok) {
        setEditing(false);
        toast.success(t('dailyExpenseSaved'));
      } else {
        toast.error(result.error);
      }
      setBusy(null);
    });
  };

  const setArchived = (archived: boolean) => {
    setBusy(archived ? 'archive' : 'restore');
    startTransition(async () => {
      const result = await editDailyExpense(dailyExpense.id, { archived });
      if (result.ok) {
        setConfirming(false);
        toast.success(
          archived ? t('dailyExpenseArchived') : t('dailyExpenseRestored')
        );
      } else {
        toast.error(result.error);
      }
      setBusy(null);
    });
  };

  if (editing) {
    return (
      <li className="py-3">
        <DailyExpenseForm
          dailyExpense={dailyExpense}
          accounts={accounts}
          categories={categories}
          pending={pending}
          onSubmit={save}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <span className="block truncate text-ink/80">{dailyExpense.name}</span>
        <span className="block text-sm text-ink-muted">
          {formatMoney(dailyExpense.dailyAmountMinor, dailyExpense.currency, {
            withCurrency: true,
          })}
          {t('perDaySuffix')}
          {' · '}
          {account?.name ?? t('unknownAccount')}
        </span>
        <span className="mt-1 flex flex-wrap gap-1">
          <span className="rounded-full bg-bg px-2 py-0.5 text-xs text-ink-muted">
            {t(`cadence.${dailyExpense.chargeCadence}`)}
          </span>
          {dailyExpense.capMinor != null ? (
            <span className="rounded-full bg-bg px-2 py-0.5 text-xs text-ink-muted">
              {t('capBadge', {
                cap: formatMoney(dailyExpense.capMinor, dailyExpense.currency, {
                  withCurrency: true,
                }),
              })}
            </span>
          ) : null}
          {category ? (
            <span className="rounded-full bg-bg px-2 py-0.5 text-xs text-ink-muted">
              {category.name}
            </span>
          ) : null}
        </span>
      </div>

      {dailyExpense.archived ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setArchived(false)}
          disabled={pending}
          className="text-sm"
        >
          {busy === 'restore' ? t('restoring') : t('restore')}
        </Button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-md px-2 py-1 text-sm text-ink-muted hover:bg-surface hover:text-ink"
          >
            {t('edit')}
          </button>
          {confirming ? (
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setArchived(true)}
                disabled={pending}
                className="rounded-md px-2 py-1 text-sm font-medium text-accent-700 hover:bg-surface disabled:opacity-50"
              >
                {busy === 'archive' ? t('archiving') : t('archiveConfirm')}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="rounded-md px-2 py-1 text-sm text-ink-muted hover:bg-surface disabled:opacity-50"
              >
                {tCommon('cancel')}
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={t('archiveDailyExpenseAria')}
              className="shrink-0 rounded-md px-2 py-1 text-ink-muted transition-colors hover:bg-surface hover:text-accent-700"
            >
              <TrashIcon />
            </button>
          )}
        </>
      )}
    </li>
  );
}

function AddDailyExpenseForm({
  accounts,
  categories,
}: {
  accounts: HorizonAccount[];
  categories: Category[];
}) {
  const t = useTranslations('Horizon.moneyOut');
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const submit = (values: DailyExpenseFormSubmitValues) => {
    startTransition(async () => {
      const result = await addDailyExpense(values);
      if (result.ok) {
        setOpen(false);
        toast.success(t('dailyExpenseAdded'));
      } else {
        toast.error(result.error);
      }
    });
  };

  if (accounts.filter((a) => !a.archived).length === 0) {
    return <p className="text-sm text-ink-muted">{t('needsAccountFirst')}</p>;
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        className="w-full py-3"
      >
        {t('addDailyExpense')}
      </Button>
    );
  }

  return (
    <DailyExpenseForm
      accounts={accounts}
      categories={categories}
      pending={pending}
      onSubmit={submit}
      onCancel={() => setOpen(false)}
    />
  );
}

export function DailyExpenseList({
  dailyExpenses,
  accounts,
  categories,
}: {
  dailyExpenses: DailyExpense[];
  accounts: HorizonAccount[];
  categories: Category[];
}) {
  const t = useTranslations('Horizon.moneyOut');

  const active = dailyExpenses.filter((d) => !d.archived);
  const archived = dailyExpenses.filter((d) => d.archived);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
        {t('dailyExpenseSectionTitle')}
      </h2>

      {active.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('noDailyExpensesYet')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-sand-300/60">
          {active.map((d) => (
            <DailyExpenseRow
              key={d.id}
              dailyExpense={d}
              accounts={accounts}
              categories={categories}
            />
          ))}
        </ul>
      )}
      <AddDailyExpenseForm accounts={accounts} categories={categories} />

      {archived.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
            {t('archivedTitle')}
          </h3>
          <ul className="flex flex-col divide-y divide-sand-300/60">
            {archived.map((d) => (
              <DailyExpenseRow
                key={d.id}
                dailyExpense={d}
                accounts={accounts}
                categories={categories}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
