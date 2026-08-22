import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import {
  createHoliday,
  createIncomeSchedule,
  createIncomeStream,
  deleteHoliday,
  deleteIncomeSchedule,
  deleteIncomeStream,
  updateIncomeStream,
  updateWorkCalendar,
} from './income';

describe('createIncomeStream', () => {
  it('appends after the current highest sort_order', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_income_streams', [
      {
        id: 's1',
        household_id: 'h1',
        account_id: 'a1',
        name: 'Existing',
        kind: 'fixed',
        currency: 'RSD',
        fixed_amount_minor: 1000,
        recurrence: 'recurring',
        confidence: 'confirmed',
        taxable: true,
        start_date: '2026-01-01',
        end_date: null,
        sort_order: 3,
        archived: false,
      },
    ]);

    const stream = await createIncomeStream(client, 'h1', {
      kind: 'hourly',
      accountId: 'a1',
      name: 'Freelance',
      currency: 'RSD',
      hourlyRateMinor: 5000,
      hoursPerDay: 7.5,
      startDate: '2026-02-01',
    });

    expect(stream.sortOrder).toBe(4);
    expect(stream).toMatchObject({
      kind: 'hourly',
      hourlyRateMinor: 5000,
      hoursPerDay: 7.5,
    });
  });

  it('stores a fixed stream with no hourly fields', async () => {
    const { client } = fakeSupabase();
    const stream = await createIncomeStream(client, 'h1', {
      kind: 'fixed',
      accountId: 'a1',
      name: 'Retainer',
      currency: 'EUR',
      fixedAmountMinor: 200000,
      startDate: '2026-02-01',
    });
    expect(stream).toMatchObject({ kind: 'fixed', fixedAmountMinor: 200000 });
  });
});

describe('updateIncomeStream', () => {
  it('returns null when the stream is not in this household', async () => {
    const { client } = fakeSupabase();
    expect(
      await updateIncomeStream(client, 'h1', 'missing', { archived: true })
    ).toBeNull();
  });

  it('patches only the given fields', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_income_streams', [
      {
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
      },
    ]);

    const updated = await updateIncomeStream(client, 'h1', 's1', {
      confidence: 'uncertain',
      hoursPerDay: 6,
    });
    expect(updated).toMatchObject({ confidence: 'uncertain', hoursPerDay: 6 });
  });
});

describe('deleteIncomeStream', () => {
  it('returns false when nothing matched', async () => {
    const { client } = fakeSupabase();
    expect(await deleteIncomeStream(client, 'h1', 'missing')).toBe(false);
  });

  it('deletes a matching stream', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_income_streams', [
      {
        id: 's1',
        household_id: 'h1',
        account_id: 'a1',
        name: 'Freelance',
        kind: 'fixed',
        currency: 'RSD',
        fixed_amount_minor: 1000,
        recurrence: 'recurring',
        confidence: 'confirmed',
        taxable: true,
        start_date: '2026-01-01',
        end_date: null,
        sort_order: 0,
        archived: false,
      },
    ]);
    expect(await deleteIncomeStream(client, 'h1', 's1')).toBe(true);
    expect(db.rows('horizon_income_streams')).toHaveLength(0);
  });
});

describe('createIncomeSchedule / deleteIncomeSchedule', () => {
  it('creates a dayOfMonth schedule with only its relevant fields set', async () => {
    const { client } = fakeSupabase();
    const schedule = await createIncomeSchedule(client, 'h1', 's1', {
      kind: 'dayOfMonth',
      dayOfMonth: 15,
    });
    expect(schedule).toMatchObject({
      kind: 'dayOfMonth',
      dayOfMonth: 15,
      intervalDays: null,
      anchorDate: null,
      slippagePolicy: 'nextBusinessDay',
      coversPeriod: 'same',
    });
  });

  it('creates an everyNDays schedule with an anchor date', async () => {
    const { client } = fakeSupabase();
    const schedule = await createIncomeSchedule(client, 'h1', 's1', {
      kind: 'everyNDays',
      intervalDays: 14,
      anchorDate: '2026-01-05',
    });
    expect(schedule).toMatchObject({
      kind: 'everyNDays',
      intervalDays: 14,
      anchorDate: '2026-01-05',
    });
  });

  it('deletes a schedule scoped to the household', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_income_schedules', [
      {
        id: 'sc1',
        household_id: 'h1',
        income_stream_id: 's1',
        kind: 'monthEnd',
        day_of_month: null,
        interval_days: null,
        nth_weekday: null,
        weekday: null,
        anchor_date: null,
        slippage_policy: 'nextBusinessDay',
        covers_period: 'same',
      },
    ]);
    expect(await deleteIncomeSchedule(client, 'h1', 'sc1')).toBe(true);
    expect(await deleteIncomeSchedule(client, 'h1', 'sc1')).toBe(false);
  });
});

describe('updateWorkCalendar', () => {
  it('creates the calendar row on first write', async () => {
    const { client } = fakeSupabase();
    const calendar = await updateWorkCalendar(client, 'h1', {
      workingWeekdays: [1, 2, 3, 4],
    });
    expect(calendar).toEqual({ workingWeekdays: [1, 2, 3, 4] });
  });

  it('overwrites the existing row rather than duplicating it', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_work_calendars', [
      {
        household_id: 'h1',
        working_weekdays: [1, 2, 3, 4, 5],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    await updateWorkCalendar(client, 'h1', { workingWeekdays: [1, 2, 3] });
    expect(db.rows('horizon_work_calendars')).toHaveLength(1);
    expect(db.rows('horizon_work_calendars')[0].working_weekdays).toEqual([
      1, 2, 3,
    ]);
  });
});

describe('createHoliday / deleteHoliday', () => {
  it('creates a holiday', async () => {
    const { client } = fakeSupabase();
    const holiday = await createHoliday(client, 'h1', {
      date: '2026-01-01',
      name: "New Year's",
    });
    expect(holiday).toMatchObject({ date: '2026-01-01', name: "New Year's" });
  });

  it('deletes a holiday scoped to the household', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_holidays', [
      {
        id: 'hol1',
        household_id: 'h1',
        date: '2026-01-01',
        name: "New Year's",
      },
    ]);
    expect(await deleteHoliday(client, 'h1', 'hol1')).toBe(true);
    expect(await deleteHoliday(client, 'other', 'hol1')).toBe(false);
  });
});
