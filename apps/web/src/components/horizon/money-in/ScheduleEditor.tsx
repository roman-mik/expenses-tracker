'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { IncomeSchedule, ScheduleKind } from '@/lib/horizon/income/types';
import { SLIPPAGE_POLICIES } from '@/lib/horizon/income/types';
import {
  nextDatesForSchedules,
  type ScheduleCalendar,
} from '@/lib/horizon/income/schedule';
import {
  addIncomeSchedule,
  deleteIncomeSchedule,
} from '@/app/actions/horizon-income';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { TrashIcon } from '@/components/ui/icons';

const SCHEDULE_KINDS: ScheduleKind[] = [
  'dayOfMonth',
  'monthEnd',
  'everyNDays',
  'nthWeekday',
  'oneOff',
];

function scheduleSummary(
  schedule: IncomeSchedule,
  t: ReturnType<typeof useTranslations>
): string {
  switch (schedule.kind) {
    case 'dayOfMonth':
      return t('summary.dayOfMonth', { day: schedule.dayOfMonth ?? 0 });
    case 'monthEnd':
      return t('summary.monthEnd');
    case 'everyNDays':
      return t('summary.everyNDays', {
        interval: schedule.intervalDays ?? 0,
        anchor: schedule.anchorDate ?? '',
      });
    case 'nthWeekday':
      return t('summary.nthWeekday', {
        nth: schedule.nthWeekday ?? 0,
        weekday: t(`weekday.${schedule.weekday ?? 0}`),
      });
    case 'oneOff':
      return t('summary.oneOff', { date: schedule.anchorDate ?? '' });
  }
}

export function ScheduleEditor({
  incomeStreamId,
  schedules,
  calendar,
}: {
  incomeStreamId: string;
  schedules: IncomeSchedule[];
  calendar: ScheduleCalendar;
}) {
  const t = useTranslations('Horizon.moneyIn.schedule');
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = nextDatesForSchedules(schedules, calendar, today, 6);

  const remove = (id: string) => {
    setRemovingId(id);
    startTransition(async () => {
      const result = await deleteIncomeSchedule(id);
      if (!result.ok) toast.error(result.error);
      setRemovingId(null);
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-bg p-3">
      <h4 className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
        {t('title')}
      </h4>

      {schedules.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('noSchedulesYet')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-sand-300/60">
          {schedules.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-ink/80">
                {scheduleSummary(s, t)}
              </span>
              <button
                type="button"
                onClick={() => remove(s.id)}
                disabled={pending}
                aria-label={t('removeAria')}
                className="shrink-0 rounded-md px-2 py-1 text-ink-muted transition-colors hover:bg-surface hover:text-accent-700 disabled:opacity-50"
              >
                {removingId === s.id ? '…' : <TrashIcon />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {upcoming.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
            {t('upcomingTitle')}
          </span>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {upcoming.map((occ, i) => (
              <li key={`${occ.scheduleId}-${occ.date}-${i}`}>
                {occ.shifted ? (
                  <span>
                    <span className="text-ink-muted line-through">
                      {occ.originalDate}
                    </span>{' '}
                    <span className="text-ink/80">→ {occ.date}</span>
                  </span>
                ) : (
                  <span className="text-ink/80">{occ.date}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {adding ? (
        <AddScheduleForm
          incomeStreamId={incomeStreamId}
          onDone={() => setAdding(false)}
        />
      ) : (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setAdding(true)}
          className="w-full py-2 text-sm"
        >
          {t('addSchedule')}
        </Button>
      )}
    </div>
  );
}

function AddScheduleForm({
  incomeStreamId,
  onDone,
}: {
  incomeStreamId: string;
  onDone: () => void;
}) {
  const t = useTranslations('Horizon.moneyIn.schedule');
  const tCommon = useTranslations('Common');
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [kind, setKind] = useState<ScheduleKind>('dayOfMonth');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [intervalDays, setIntervalDays] = useState('14');
  const [anchorDate, setAnchorDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [nthWeekday, setNthWeekday] = useState('1');
  const [weekday, setWeekday] = useState('5');
  const [slippagePolicy, setSlippagePolicy] =
    useState<(typeof SLIPPAGE_POLICIES)[number]>('nextBusinessDay');

  const submit = () => {
    if (pending) return;
    const common = { slippagePolicy };
    let input: Record<string, unknown>;
    switch (kind) {
      case 'dayOfMonth':
        input = { kind, dayOfMonth: Number(dayOfMonth), ...common };
        break;
      case 'monthEnd':
        input = { kind, ...common };
        break;
      case 'everyNDays':
        input = {
          kind,
          intervalDays: Number(intervalDays),
          anchorDate,
          ...common,
        };
        break;
      case 'nthWeekday':
        input = {
          kind,
          nthWeekday: Number(nthWeekday),
          weekday: Number(weekday),
          ...common,
        };
        break;
      case 'oneOff':
        input = { kind, anchorDate, ...common };
        break;
    }

    startTransition(async () => {
      const result = await addIncomeSchedule(incomeStreamId, input);
      if (result.ok) {
        toast.success(t('scheduleAdded'));
        onDone();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface p-3">
      <div
        role="radiogroup"
        aria-label={t('kindLabel')}
        className="flex flex-wrap gap-2"
      >
        {SCHEDULE_KINDS.map((k) => {
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

      {kind === 'dayOfMonth' ? (
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          <span>{t('dayOfMonthLabel')}</span>
          <input
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
            inputMode="numeric"
            className="w-full rounded-lg bg-bg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
      ) : null}

      {kind === 'everyNDays' ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            <span>{t('intervalDaysLabel')}</span>
            <input
              value={intervalDays}
              onChange={(e) => setIntervalDays(e.target.value)}
              inputMode="numeric"
              className="w-full rounded-lg bg-bg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            <span>{t('anchorDateLabel')}</span>
            <input
              type="date"
              value={anchorDate}
              onChange={(e) => setAnchorDate(e.target.value)}
              className="w-full rounded-lg bg-bg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>
        </div>
      ) : null}

      {kind === 'nthWeekday' ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            <span>{t('nthWeekdayLabel')}</span>
            <select
              value={nthWeekday}
              onChange={(e) => setNthWeekday(e.target.value)}
              className="w-full rounded-lg bg-bg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            <span>{t('weekdayLabel')}</span>
            <select
              value={weekday}
              onChange={(e) => setWeekday(e.target.value)}
              className="w-full rounded-lg bg-bg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
            >
              {[0, 1, 2, 3, 4, 5, 6].map((w) => (
                <option key={w} value={w}>
                  {t(`weekday.${w}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {kind === 'oneOff' ? (
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          <span>{t('anchorDateLabel')}</span>
          <input
            type="date"
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
            className="w-full rounded-lg bg-bg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
      ) : null}

      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        <span>{t('slippagePolicyLabel')}</span>
        <select
          value={slippagePolicy}
          onChange={(e) =>
            setSlippagePolicy(
              e.target.value as (typeof SLIPPAGE_POLICIES)[number]
            )
          }
          className="w-full rounded-lg bg-bg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        >
          {SLIPPAGE_POLICIES.map((p) => (
            <option key={p} value={p}>
              {t(`slippagePolicy.${p}`)}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={submit}
          disabled={pending}
          className="px-4 py-2 text-sm"
        >
          {pending ? tCommon('saving') : t('addSchedule')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onDone}
          disabled={pending}
          className="text-sm"
        >
          {tCommon('cancel')}
        </Button>
      </div>
    </div>
  );
}
