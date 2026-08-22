'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { HorizonAccount } from '@/lib/horizon/types';
import type { OneOffEvent } from '@/lib/horizon/spending/types';
import { formatMoney } from '@/lib/format';
import {
  addOneOffEvent,
  deleteOneOffEvent,
  editOneOffEvent,
} from '@/app/actions/horizon-spending';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { TrashIcon } from '@/components/ui/icons';
import {
  OneOffEventForm,
  type OneOffEventFormSubmitValues,
} from './OneOffEventForm';

const DIRECTION_BADGE: Record<OneOffEvent['direction'], string> = {
  in: 'bg-emerald-100 text-emerald-700',
  out: 'bg-rose-100 text-rose-700',
};

function OneOffEventRow({
  oneOffEvent,
  accounts,
}: {
  oneOffEvent: OneOffEvent;
  accounts: HorizonAccount[];
}) {
  const t = useTranslations('Horizon.moneyOut');
  const tCommon = useTranslations('Common');
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'delete'>(null);

  const account = accounts.find((a) => a.id === oneOffEvent.accountId);

  const save = (values: OneOffEventFormSubmitValues) => {
    setBusy('save');
    startTransition(async () => {
      const result = await editOneOffEvent(oneOffEvent.id, values);
      if (result.ok) {
        setEditing(false);
        toast.success(t('oneOffEventSaved'));
      } else {
        toast.error(result.error);
      }
      setBusy(null);
    });
  };

  const remove = () => {
    setBusy('delete');
    startTransition(async () => {
      const result = await deleteOneOffEvent(oneOffEvent.id);
      if (result.ok) {
        toast.success(t('oneOffEventDeleted'));
      } else {
        toast.error(result.error);
      }
      setConfirming(false);
      setBusy(null);
    });
  };

  if (editing) {
    return (
      <li className="py-3">
        <OneOffEventForm
          oneOffEvent={oneOffEvent}
          accounts={accounts}
          pending={pending}
          onSubmit={save}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 py-3">
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${DIRECTION_BADGE[oneOffEvent.direction]}`}
      >
        {t(`direction.${oneOffEvent.direction}`)}
      </span>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-ink/80">{oneOffEvent.name}</span>
        <span className="block text-sm text-ink-muted">
          {formatMoney(oneOffEvent.amountMinor, oneOffEvent.currency, {
            withCurrency: true,
          })}
          {' · '}
          {oneOffEvent.date}
          {' · '}
          {account?.name ?? t('unknownAccount')}
        </span>
        <span className="mt-1 flex flex-wrap gap-1">
          <span className="rounded-full bg-bg px-2 py-0.5 text-xs text-ink-muted">
            {t(`oneOffCategory.${oneOffEvent.category}`)}
          </span>
        </span>
      </div>

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
            onClick={remove}
            disabled={pending}
            className="rounded-md px-2 py-1 text-sm font-medium text-accent-700 hover:bg-surface disabled:opacity-50"
          >
            {busy === 'delete' ? t('deleting') : t('deleteConfirm')}
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
          aria-label={t('deleteOneOffEventAria')}
          className="shrink-0 rounded-md px-2 py-1 text-ink-muted transition-colors hover:bg-surface hover:text-accent-700"
        >
          <TrashIcon />
        </button>
      )}
    </li>
  );
}

function AddOneOffEventForm({ accounts }: { accounts: HorizonAccount[] }) {
  const t = useTranslations('Horizon.moneyOut');
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const submit = (values: OneOffEventFormSubmitValues) => {
    startTransition(async () => {
      const result = await addOneOffEvent(values);
      if (result.ok) {
        setOpen(false);
        toast.success(t('oneOffEventAdded'));
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
        {t('addOneOffEvent')}
      </Button>
    );
  }

  return (
    <OneOffEventForm
      accounts={accounts}
      pending={pending}
      onSubmit={submit}
      onCancel={() => setOpen(false)}
    />
  );
}

export function OneOffEventList({
  oneOffEvents,
  accounts,
}: {
  oneOffEvents: OneOffEvent[];
  accounts: HorizonAccount[];
}) {
  const t = useTranslations('Horizon.moneyOut');
  const sorted = [...oneOffEvents].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
        {t('oneOffSectionTitle')}
      </h2>

      {sorted.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('noOneOffEventsYet')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-sand-300/60">
          {sorted.map((e) => (
            <OneOffEventRow key={e.id} oneOffEvent={e} accounts={accounts} />
          ))}
        </ul>
      )}
      <AddOneOffEventForm accounts={accounts} />
    </section>
  );
}
