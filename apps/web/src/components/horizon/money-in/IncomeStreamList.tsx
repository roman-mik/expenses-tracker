'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { HorizonAccount } from '@/lib/horizon/types';
import type { IncomeSchedule, IncomeStream } from '@/lib/horizon/income/types';
import { monthlyIncomeForStream } from '@/lib/horizon/income/income-math';
import type { ScheduleCalendar } from '@/lib/horizon/schedule';
import { formatMoney } from '@/lib/format';
import {
  addIncomeSchedule,
  addIncomeStream,
  deleteIncomeSchedule,
  editIncomeStream,
} from '@/app/actions/horizon-income';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { TrashIcon } from '@/components/ui/icons';
import {
  IncomeStreamForm,
  type IncomeStreamFormSubmitValues,
} from './IncomeStreamForm';
import { ScheduleEditor } from '../schedule/ScheduleEditor';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function StreamRow({
  stream,
  schedules,
  accounts,
  calendar,
}: {
  stream: IncomeStream;
  schedules: IncomeSchedule[];
  accounts: HorizonAccount[];
  calendar: ScheduleCalendar;
}) {
  const t = useTranslations('Horizon.moneyIn');
  const tCommon = useTranslations('Common');
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'archive' | 'restore'>(null);

  const account = accounts.find((a) => a.id === stream.accountId);
  const monthlyMinor = monthlyIncomeForStream(
    stream,
    schedules,
    currentMonth(),
    calendar
  );

  const save = (values: IncomeStreamFormSubmitValues) => {
    setBusy('save');
    startTransition(async () => {
      const result = await editIncomeStream(stream.id, values);
      if (result.ok) {
        setEditing(false);
        toast.success(t('streamSaved'));
      } else {
        toast.error(result.error);
      }
      setBusy(null);
    });
  };

  const setArchived = (archived: boolean) => {
    setBusy(archived ? 'archive' : 'restore');
    startTransition(async () => {
      const result = await editIncomeStream(stream.id, { archived });
      if (result.ok) {
        setConfirming(false);
        toast.success(archived ? t('streamArchived') : t('streamRestored'));
      } else {
        toast.error(result.error);
      }
      setBusy(null);
    });
  };

  if (editing) {
    return (
      <li className="py-3">
        <IncomeStreamForm
          stream={stream}
          accounts={accounts}
          pending={pending}
          onSubmit={save}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          disabled={stream.archived}
          className="min-w-0 flex-1 text-left disabled:text-ink-muted"
        >
          <span className="block truncate text-ink/80">{stream.name}</span>
          <span className="block text-sm text-ink-muted">
            {formatMoney(monthlyMinor, stream.currency, { withCurrency: true })}
            {' / '}
            {t('perMonth')} · {account?.name ?? t('unknownAccount')}
          </span>
          <span className="mt-1 flex flex-wrap gap-1">
            <span className="rounded-full bg-bg px-2 py-0.5 text-xs text-ink-muted">
              {t(`kind.${stream.kind}`)}
            </span>
            <span className="rounded-full bg-bg px-2 py-0.5 text-xs text-ink-muted">
              {t(`recurrence.${stream.recurrence}`)}
            </span>
            <span className="rounded-full bg-bg px-2 py-0.5 text-xs text-ink-muted">
              {t(`confidence.${stream.confidence}`)}
            </span>
          </span>
        </button>

        {stream.archived ? (
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
                aria-label={t('archiveAria')}
                className="shrink-0 rounded-md px-2 py-1 text-ink-muted transition-colors hover:bg-surface hover:text-accent-700"
              >
                <TrashIcon />
              </button>
            )}
          </>
        )}
      </div>

      {expanded && !stream.archived ? (
        <ScheduleEditor
          schedules={schedules}
          calendar={calendar}
          onAdd={(input) => addIncomeSchedule(stream.id, input)}
          onRemove={deleteIncomeSchedule}
        />
      ) : null}
    </li>
  );
}

function AddStreamForm({ accounts }: { accounts: HorizonAccount[] }) {
  const t = useTranslations('Horizon.moneyIn');
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const submit = (values: IncomeStreamFormSubmitValues) => {
    startTransition(async () => {
      const result = await addIncomeStream(values);
      if (result.ok) {
        setOpen(false);
        toast.success(t('streamAdded'));
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
        {t('addStream')}
      </Button>
    );
  }

  return (
    <IncomeStreamForm
      accounts={accounts}
      pending={pending}
      onSubmit={submit}
      onCancel={() => setOpen(false)}
    />
  );
}

export function IncomeStreamList({
  streams,
  schedules,
  accounts,
  calendar,
}: {
  streams: IncomeStream[];
  schedules: IncomeSchedule[];
  accounts: HorizonAccount[];
  calendar: ScheduleCalendar;
}) {
  const t = useTranslations('Horizon.moneyIn');
  const active = streams
    .filter((s) => !s.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const archived = streams
    .filter((s) => s.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const schedulesFor = (streamId: string) =>
    schedules.filter((s) => s.incomeStreamId === streamId);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
          {t('sectionTitle')}
        </h2>
        {active.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('noStreamsYet')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-sand-300/60">
            {active.map((s) => (
              <StreamRow
                key={s.id}
                stream={s}
                schedules={schedulesFor(s.id)}
                accounts={accounts}
                calendar={calendar}
              />
            ))}
          </ul>
        )}
        <AddStreamForm accounts={accounts} />
      </section>

      {archived.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
            {t('archivedTitle')}
          </h2>
          <ul className="flex flex-col divide-y divide-sand-300/60">
            {archived.map((s) => (
              <StreamRow
                key={s.id}
                stream={s}
                schedules={schedulesFor(s.id)}
                accounts={accounts}
                calendar={calendar}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
