'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Currency } from '@/lib/types';
import type { FxRate, HorizonAccount } from '@/lib/horizon/types';
import type { IncomeStream } from '@/lib/horizon/income/types';
import type {
  Obligation,
  ObligationSchedule,
} from '@/lib/horizon/spending/types';
import {
  coveredPeriod,
  nextDatesForSchedules,
  type ScheduleCalendar,
} from '@/lib/horizon/schedule';
import { categoryShares } from '@/lib/horizon/spending/spending-math';
import {
  availableWorkingHours,
  blendedHourlyRate,
  obligationCostInHours,
} from '@/lib/horizon/spending/hours';
import { convert, pickRate } from '@/lib/horizon/fx';
import { formatMoney } from '@/lib/format';
import {
  addObligation,
  addObligationSchedule,
  deleteObligationSchedule,
  editObligation,
} from '@/app/actions/horizon-spending';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { TrashIcon } from '@/components/ui/icons';
import {
  ObligationForm,
  type ObligationFormSubmitValues,
} from './ObligationForm';
import { CategoryShareBar } from './CategoryShareBar';
import { ScheduleEditor } from '../schedule/ScheduleEditor';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function monthLabel(period: string, locale: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function ObligationRow({
  obligation,
  schedules,
  accounts,
  calendar,
  reportingCurrency,
  rates,
  blendedRateMinor,
  today,
}: {
  obligation: Obligation;
  schedules: ObligationSchedule[];
  accounts: HorizonAccount[];
  calendar: ScheduleCalendar;
  reportingCurrency: Currency;
  rates: FxRate[];
  blendedRateMinor: number | null;
  today: string;
}) {
  const t = useTranslations('Horizon.moneyOut');
  const tCommon = useTranslations('Common');
  const locale = useLocale();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'archive' | 'restore'>(null);

  const account = accounts.find((a) => a.id === obligation.accountId);

  const needsConversion = obligation.currency !== reportingCurrency;
  const rate = needsConversion
    ? pickRate(rates, {
        base: obligation.currency,
        quote: reportingCurrency,
        onOrBefore: today,
      })
    : null;
  const convertedMinor =
    needsConversion && rate
      ? convert(
          obligation.amountMinor,
          obligation.currency,
          reportingCurrency,
          rate
        )
      : null;

  const upcoming = nextDatesForSchedules(schedules, calendar, today, 1);
  const next = upcoming[0];
  const nextSchedule = next
    ? schedules.find((s) => s.id === next.scheduleId)
    : undefined;
  const period =
    next && nextSchedule
      ? coveredPeriod(next.originalDate ?? next.date, nextSchedule)
      : null;

  const hours =
    blendedRateMinor !== null
      ? obligationCostInHours(
          obligation.amountMinor,
          obligation.currency,
          blendedRateMinor,
          reportingCurrency,
          rates,
          today
        )
      : null;

  const save = (values: ObligationFormSubmitValues) => {
    setBusy('save');
    startTransition(async () => {
      const result = await editObligation(obligation.id, values);
      if (result.ok) {
        setEditing(false);
        toast.success(t('obligationSaved'));
      } else {
        toast.error(result.error);
      }
      setBusy(null);
    });
  };

  const setArchived = (archived: boolean) => {
    setBusy(archived ? 'archive' : 'restore');
    startTransition(async () => {
      const result = await editObligation(obligation.id, { archived });
      if (result.ok) {
        setConfirming(false);
        toast.success(
          archived ? t('obligationArchived') : t('obligationRestored')
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
        <ObligationForm
          obligation={obligation}
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
          disabled={obligation.archived}
          className="min-w-0 flex-1 text-left disabled:text-ink-muted"
        >
          <span className="block truncate text-ink/80">{obligation.name}</span>
          <span className="block text-sm text-ink-muted">
            {formatMoney(obligation.amountMinor, obligation.currency, {
              withCurrency: true,
            })}
            {needsConversion && (
              <>
                {' '}
                {convertedMinor !== null
                  ? `≈ ${formatMoney(convertedMinor, reportingCurrency, { withCurrency: true })}`
                  : t('shareBar.missingRate')}
              </>
            )}
            {' · '}
            {account?.name ?? t('unknownAccount')}
          </span>
          <span className="mt-1 flex flex-wrap gap-1">
            <span className="rounded-full bg-bg px-2 py-0.5 text-xs text-ink-muted">
              {t(`category.${obligation.category}`)}
            </span>
            <span className="rounded-full bg-bg px-2 py-0.5 text-xs text-ink-muted">
              {t(`recurrence.${obligation.recurrence}`)}
            </span>
            <span className="rounded-full bg-bg px-2 py-0.5 text-xs text-ink-muted">
              {t(`confidence.${obligation.confidence}`)}
            </span>
            {next ? (
              <span className="rounded-full bg-bg px-2 py-0.5 text-xs text-ink-muted">
                {t('dueLabel', { date: next.date })}
                {period
                  ? ` · ${t('coveredPeriodLabel', { month: monthLabel(period, locale) })}`
                  : ''}
              </span>
            ) : (
              <span className="rounded-full bg-bg px-2 py-0.5 text-xs text-ink-muted">
                {t('noUpcomingOccurrence')}
              </span>
            )}
            {hours !== null ? (
              <span className="rounded-full bg-bg px-2 py-0.5 text-xs text-ink-muted">
                {t('hoursLabel', { hours: hours.toFixed(1) })}
              </span>
            ) : null}
          </span>
        </button>

        {obligation.archived ? (
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

      {expanded && !obligation.archived ? (
        <ScheduleEditor
          schedules={schedules}
          calendar={calendar}
          onAdd={(input) => addObligationSchedule(obligation.id, input)}
          onRemove={deleteObligationSchedule}
        />
      ) : null}
    </li>
  );
}

function AddObligationForm({ accounts }: { accounts: HorizonAccount[] }) {
  const t = useTranslations('Horizon.moneyOut');
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const submit = (values: ObligationFormSubmitValues) => {
    startTransition(async () => {
      const result = await addObligation(values);
      if (result.ok) {
        setOpen(false);
        toast.success(t('obligationAdded'));
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
        {t('addObligation')}
      </Button>
    );
  }

  return (
    <ObligationForm
      accounts={accounts}
      pending={pending}
      onSubmit={submit}
      onCancel={() => setOpen(false)}
    />
  );
}

export function ObligationList({
  obligations,
  schedules,
  accounts,
  calendar,
  incomeStreams,
  reportingCurrency,
  rates,
}: {
  obligations: Obligation[];
  schedules: ObligationSchedule[];
  accounts: HorizonAccount[];
  calendar: ScheduleCalendar;
  incomeStreams: IncomeStream[];
  reportingCurrency: Currency;
  rates: FxRate[];
}) {
  const t = useTranslations('Horizon.moneyOut');
  const today = new Date().toISOString().slice(0, 10);
  const month = currentMonth();

  const active = obligations
    .filter((o) => !o.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const archived = obligations
    .filter((o) => o.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const schedulesFor = (obligationId: string) =>
    schedules.filter((s) => s.obligationId === obligationId);

  const blendedRateMinor = blendedHourlyRate(
    incomeStreams,
    calendar,
    month,
    reportingCurrency,
    rates
  );
  const availableHours = availableWorkingHours(incomeStreams, calendar, month);
  const totalHours = blendedRateMinor
    ? active.reduce((sum, o) => {
        const hours = obligationCostInHours(
          o.amountMinor,
          o.currency,
          blendedRateMinor,
          reportingCurrency,
          rates,
          today
        );
        return sum + (hours ?? 0);
      }, 0)
    : null;
  const overBudget =
    totalHours !== null && availableHours > 0 && totalHours > availableHours;

  const shares = categoryShares(
    active.map((o) => ({
      category: o.category,
      amountMinor: o.amountMinor,
      currency: o.currency,
    })),
    reportingCurrency,
    rates,
    today
  );

  return (
    <div className="flex flex-col gap-8">
      <CategoryShareBar shares={shares} reportingCurrency={reportingCurrency} />

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
          {t('sectionTitle')}
        </h2>

        {totalHours !== null ? (
          <p
            className={`text-sm ${overBudget ? 'font-medium text-accent-700' : 'text-ink-muted'}`}
          >
            {t('hoursSummary', {
              total: totalHours.toFixed(1),
              available: availableHours.toFixed(1),
            })}
            {overBudget ? ` ${t('hoursOverBudget')}` : ''}
          </p>
        ) : null}

        {active.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('noObligationsYet')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-sand-300/60">
            {active.map((o) => (
              <ObligationRow
                key={o.id}
                obligation={o}
                schedules={schedulesFor(o.id)}
                accounts={accounts}
                calendar={calendar}
                reportingCurrency={reportingCurrency}
                rates={rates}
                blendedRateMinor={blendedRateMinor}
                today={today}
              />
            ))}
          </ul>
        )}
        <AddObligationForm accounts={accounts} />
      </section>

      {archived.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
            {t('archivedTitle')}
          </h2>
          <ul className="flex flex-col divide-y divide-sand-300/60">
            {archived.map((o) => (
              <ObligationRow
                key={o.id}
                obligation={o}
                schedules={schedulesFor(o.id)}
                accounts={accounts}
                calendar={calendar}
                reportingCurrency={reportingCurrency}
                rates={rates}
                blendedRateMinor={blendedRateMinor}
                today={today}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
