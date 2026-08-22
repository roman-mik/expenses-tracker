import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import {
  getHolidays,
  getIncomeSchedules,
  getIncomeStreams,
  getSchedulesForStream,
  getWorkCalendar,
} from './income';

const hourlyStream = {
  id: 's1',
  household_id: 'h1',
  account_id: 'a1',
  name: 'Freelance',
  kind: 'hourly',
  currency: 'RSD',
  hourly_rate_minor: 5000,
  hours_per_day_e2: 800,
  fixed_amount_minor: null,
  recurrence: 'recurring',
  confidence: 'confirmed',
  taxable: true,
  start_date: '2026-01-01',
  end_date: null,
  sort_order: 0,
  archived: false,
};

describe('getIncomeStreams', () => {
  it('returns streams for the household, ordered by sort_order, mapped by kind', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_income_streams', [
      { ...hourlyStream, id: 's2', sort_order: 1 },
      { ...hourlyStream, id: 's1', sort_order: 0 },
      {
        ...hourlyStream,
        id: 's3',
        household_id: 'other',
        sort_order: 0,
      },
    ]);

    const streams = await getIncomeStreams(client, 'h1');
    expect(streams.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(streams[0]).toMatchObject({
      kind: 'hourly',
      hourlyRateMinor: 5000,
      hoursPerDay: 8,
    });
  });

  it('maps a fixed stream without hourly fields', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_income_streams', [
      {
        ...hourlyStream,
        id: 's1',
        kind: 'fixed',
        hourly_rate_minor: null,
        hours_per_day_e2: null,
        fixed_amount_minor: 150000,
      },
    ]);

    const [stream] = await getIncomeStreams(client, 'h1');
    expect(stream).toMatchObject({ kind: 'fixed', fixedAmountMinor: 150000 });
    expect(stream).not.toHaveProperty('hourlyRateMinor');
  });

  it('returns an empty list when the household has no streams', async () => {
    const { client } = fakeSupabase();
    expect(await getIncomeStreams(client, 'h1')).toEqual([]);
  });
});

describe('getIncomeSchedules / getSchedulesForStream', () => {
  const schedule15th = {
    id: 'sc1',
    household_id: 'h1',
    income_stream_id: 's1',
    kind: 'dayOfMonth',
    day_of_month: 15,
    interval_days: null,
    nth_weekday: null,
    weekday: null,
    anchor_date: null,
    slippage_policy: 'nextBusinessDay',
    covers_period: 'same',
  };
  const scheduleMonthEnd = {
    ...schedule15th,
    id: 'sc2',
    kind: 'monthEnd',
    day_of_month: null,
  };

  it('returns every schedule in the household across streams', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_income_schedules', [
      schedule15th,
      scheduleMonthEnd,
      { ...schedule15th, id: 'sc3', household_id: 'other' },
    ]);

    const all = await getIncomeSchedules(client, 'h1');
    expect(all.map((s) => s.id).sort()).toEqual(['sc1', 'sc2']);
  });

  it('scopes to a single stream', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_income_schedules', [
      schedule15th,
      scheduleMonthEnd,
      { ...schedule15th, id: 'sc3', income_stream_id: 's2' },
    ]);

    const forS1 = await getSchedulesForStream(client, 'h1', 's1');
    expect(forS1.map((s) => s.id).sort()).toEqual(['sc1', 'sc2']);
  });
});

describe('getWorkCalendar', () => {
  it('falls back to Mon-Fri when the household has never written one', async () => {
    const { client } = fakeSupabase();
    expect(await getWorkCalendar(client, 'h1')).toEqual({
      workingWeekdays: [1, 2, 3, 4, 5],
    });
  });

  it('returns the stored calendar', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_work_calendars', [
      {
        household_id: 'h1',
        working_weekdays: [1, 2, 3, 4],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    expect(await getWorkCalendar(client, 'h1')).toEqual({
      workingWeekdays: [1, 2, 3, 4],
    });
  });
});

describe('getHolidays', () => {
  it('returns holidays ordered by date', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_holidays', [
      { id: 'h2', household_id: 'h1', date: '2026-05-01', name: 'Labour Day' },
      { id: 'h1', household_id: 'h1', date: '2026-01-01', name: "New Year's" },
      { id: 'h3', household_id: 'other', date: '2026-01-01', name: 'Not mine' },
    ]);
    const holidays = await getHolidays(client, 'h1');
    expect(holidays.map((h) => h.id)).toEqual(['h1', 'h2']);
  });
});
