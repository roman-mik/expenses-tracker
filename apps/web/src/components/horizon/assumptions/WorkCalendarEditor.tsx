'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { Holiday, WorkCalendar } from '@/lib/horizon/income/types';
import {
  addHoliday,
  deleteHoliday,
  setWorkCalendar,
} from '@/app/actions/horizon-income';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { TrashIcon } from '@/components/ui/icons';

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export function WorkCalendarEditor({
  initialCalendar,
  initialHolidays,
}: {
  initialCalendar: WorkCalendar;
  initialHolidays: Holiday[];
}) {
  const t = useTranslations('Horizon.assumptions.workCalendar');
  const toast = useToast();
  const [workingWeekdays, setWorkingWeekdays] = useState(
    initialCalendar.workingWeekdays
  );
  const [pending, startTransition] = useTransition();

  const toggleWeekday = (day: number) => {
    if (pending) return;
    const previous = workingWeekdays;
    const next = previous.includes(day)
      ? previous.filter((d) => d !== day)
      : [...previous, day].sort();
    setWorkingWeekdays(next);

    startTransition(async () => {
      const result = await setWorkCalendar({ workingWeekdays: next });
      if (!result.ok) {
        setWorkingWeekdays(previous);
        toast.error(result.error);
      }
    });
  };

  return (
    <section className="flex flex-col gap-6 rounded-xl border border-border bg-surface p-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-text-muted">{t('description')}</p>
      </div>

      <div
        role="group"
        aria-label={t('workingWeekdaysLabel')}
        className="flex flex-wrap gap-2"
      >
        {WEEKDAYS.map((day) => {
          const selected = workingWeekdays.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={selected}
              disabled={pending}
              onClick={() => toggleWeekday(day)}
              className={`flex h-11 min-w-16 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-all disabled:opacity-50 ${
                selected
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-bg text-text-muted hover:border-text-muted hover:text-text-primary'
              }`}
            >
              {t(`weekday.${day}`)}
            </button>
          );
        })}
      </div>

      <HolidayList holidays={initialHolidays} />
    </section>
  );
}

function HolidayList({ holidays }: { holidays: Holiday[] }) {
  const t = useTranslations('Horizon.assumptions.workCalendar');
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  const sorted = [...holidays].sort((a, b) => (a.date < b.date ? -1 : 1));

  const submit = () => {
    if (!date || !name.trim() || pending) return;
    startTransition(async () => {
      const result = await addHoliday({ date, name: name.trim() });
      if (result.ok) {
        setDate('');
        setName('');
        toast.success(t('holidayAdded'));
      } else {
        toast.error(result.error);
      }
    });
  };

  const remove = (id: string) => {
    setRemovingId(id);
    startTransition(async () => {
      const result = await deleteHoliday(id);
      if (!result.ok) toast.error(result.error);
      setRemovingId(null);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">
        {t('holidaysTitle')}
      </h3>

      {sorted.length === 0 ? (
        <p className="text-sm text-text-muted">{t('noHolidaysYet')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {sorted.map((h) => (
            <li key={h.id} className="flex items-center gap-3 py-2">
              <span className="w-28 shrink-0 text-sm text-text-muted">
                {h.date}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                {h.name}
              </span>
              <button
                type="button"
                onClick={() => remove(h.id)}
                disabled={pending}
                aria-label={t('removeHolidayAria')}
                className="shrink-0 rounded-md px-2 py-1 text-text-muted transition-colors hover:bg-bg hover:text-accent disabled:opacity-50"
              >
                {removingId === h.id ? '…' : <TrashIcon />}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          <span>{t('dateLabel')}</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg bg-bg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-text-muted">
          <span>{t('nameLabel')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
            maxLength={60}
            className="w-full rounded-lg bg-bg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
        <Button
          type="button"
          onClick={submit}
          disabled={pending || !date || !name.trim()}
          className="px-4 py-2 text-sm"
        >
          {t('addHoliday')}
        </Button>
      </div>
    </div>
  );
}
