'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { HorizonAccount } from '@/lib/horizon/types';
import { formatMoney } from '@/lib/format';
import {
  addHorizonAccount,
  editHorizonAccount,
  moveHorizonAccount,
} from '@/app/actions/horizon-accounts';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { TrashIcon } from '@/components/ui/icons';
import { AccountForm, type AccountFormSubmitValues } from './AccountForm';

function AccountRow({
  account,
  isFirst,
  isLast,
}: {
  account: HorizonAccount;
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useTranslations('Horizon.accounts');
  const tCommon = useTranslations('Common');
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<
    null | 'move-up' | 'move-down' | 'save' | 'archive' | 'restore'
  >(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const move = (direction: 'up' | 'down') => {
    setBusy(direction === 'up' ? 'move-up' : 'move-down');
    startTransition(async () => {
      const result = await moveHorizonAccount(account.id, direction);
      if (!result.ok) toast.error(result.error);
      setBusy(null);
    });
  };

  const save = (values: AccountFormSubmitValues) => {
    setBusy('save');
    startTransition(async () => {
      const result = await editHorizonAccount(account.id, values);
      if (result.ok) {
        setEditing(false);
        toast.success(t('accountSaved'));
      } else {
        toast.error(result.error);
      }
      setBusy(null);
    });
  };

  const setArchived = (archived: boolean) => {
    setBusy(archived ? 'archive' : 'restore');
    startTransition(async () => {
      const result = await editHorizonAccount(account.id, { archived });
      if (result.ok) {
        setConfirming(false);
        toast.success(archived ? t('accountArchived') : t('accountRestored'));
      } else {
        toast.error(result.error);
      }
      setBusy(null);
    });
  };

  if (editing) {
    return (
      <li className="py-3">
        <AccountForm
          account={account}
          pending={pending}
          onSubmit={save}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={account.archived}
          className="min-w-0 flex-1 text-left disabled:text-ink-muted"
        >
          <span className="block truncate text-ink/80">{account.name}</span>
          <span className="block text-sm text-ink-muted">
            {formatMoney(account.currentBalanceMinor, account.currency, {
              withCurrency: true,
            })}
            {!account.includeInTotal ? ` · ${t('excludedFromTotal')}` : ''}
          </span>
        </button>

        {account.archived ? (
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
            <span className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => move('up')}
                disabled={pending || isFirst}
                aria-label={t('moveUp')}
                className="rounded-md px-2 py-1 text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move('down')}
                disabled={pending || isLast}
                aria-label={t('moveDown')}
                className="rounded-md px-2 py-1 text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-30"
              >
                ▼
              </button>
            </span>

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
                aria-label={t('archiveAria')}
                className="shrink-0 rounded-md px-2 py-1 text-ink-muted transition-colors hover:bg-surface hover:text-accent-700"
              >
                <TrashIcon />
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function AddAccountForm() {
  const t = useTranslations('Horizon.accounts');
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const submit = (values: AccountFormSubmitValues) => {
    startTransition(async () => {
      const result = await addHorizonAccount(values);
      if (result.ok) {
        setOpen(false);
        toast.success(t('accountAdded'));
      } else {
        toast.error(result.error);
      }
    });
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        className="w-full py-3"
      >
        {t('addAccount')}
      </Button>
    );
  }

  return (
    <AccountForm
      pending={pending}
      onSubmit={submit}
      onCancel={() => setOpen(false)}
    />
  );
}

export function AccountList({ accounts }: { accounts: HorizonAccount[] }) {
  const t = useTranslations('Horizon.accounts');
  const active = accounts
    .filter((a) => !a.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const archived = accounts
    .filter((a) => a.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
          {t('sectionTitle')}
        </h2>
        {active.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('noAccountsYet')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-sand-300/60">
            {active.map((a, i) => (
              <AccountRow
                key={a.id}
                account={a}
                isFirst={i === 0}
                isLast={i === active.length - 1}
              />
            ))}
          </ul>
        )}
        <AddAccountForm />
      </section>

      {archived.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
            {t('archivedTitle')}
          </h2>
          <ul className="flex flex-col divide-y divide-sand-300/60">
            {archived.map((a) => (
              <AccountRow key={a.id} account={a} isFirst isLast />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
