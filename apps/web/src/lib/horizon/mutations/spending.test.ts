import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import {
  createDailyExpense,
  createObligation,
  createObligationSchedule,
  createOneOffEvent,
  deleteDailyExpense,
  deleteObligation,
  deleteObligationSchedule,
  deleteOneOffEvent,
  updateDailyExpense,
  updateObligation,
  updateOneOffEvent,
} from './spending';

describe('createObligation', () => {
  it('appends after the current highest sort_order', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_obligations', [
      {
        id: 'o1',
        household_id: 'h1',
        account_id: 'a1',
        name: 'Existing',
        category: 'housing',
        amount_minor: 1000,
        currency: 'RSD',
        recurrence: 'recurring',
        confidence: 'confirmed',
        start_date: '2026-01-01',
        end_date: null,
        sort_order: 3,
        archived: false,
      },
    ]);

    const obligation = await createObligation(client, 'h1', {
      accountId: 'a1',
      name: 'Rent',
      category: 'housing',
      amountMinor: 50000,
      currency: 'RSD',
      startDate: '2026-02-01',
    });

    expect(obligation.sortOrder).toBe(4);
    expect(obligation).toMatchObject({
      category: 'housing',
      amountMinor: 50000,
    });
  });

  it('stores an obligation with default recurrence/confidence', async () => {
    const { client } = fakeSupabase();
    const obligation = await createObligation(client, 'h1', {
      accountId: 'a1',
      name: 'Card payment',
      category: 'debt',
      amountMinor: 20000,
      currency: 'EUR',
      startDate: '2026-02-01',
    });
    expect(obligation).toMatchObject({
      recurrence: 'recurring',
      confidence: 'confirmed',
    });
  });
});

describe('updateObligation', () => {
  it('returns null when the obligation is not in this household', async () => {
    const { client } = fakeSupabase();
    expect(
      await updateObligation(client, 'h1', 'missing', { archived: true })
    ).toBeNull();
  });

  it('patches only the given fields', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_obligations', [
      {
        id: 'o1',
        household_id: 'h1',
        account_id: 'a1',
        name: 'Rent',
        category: 'housing',
        amount_minor: 50000,
        currency: 'RSD',
        recurrence: 'recurring',
        confidence: 'confirmed',
        start_date: '2026-01-01',
        end_date: null,
        sort_order: 0,
        archived: false,
      },
    ]);

    const updated = await updateObligation(client, 'h1', 'o1', {
      confidence: 'uncertain',
      amountMinor: 55000,
    });
    expect(updated).toMatchObject({
      confidence: 'uncertain',
      amountMinor: 55000,
    });
  });
});

describe('deleteObligation', () => {
  it('returns false when nothing matched', async () => {
    const { client } = fakeSupabase();
    expect(await deleteObligation(client, 'h1', 'missing')).toBe(false);
  });

  it('deletes a matching obligation', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_obligations', [
      {
        id: 'o1',
        household_id: 'h1',
        account_id: 'a1',
        name: 'Rent',
        category: 'housing',
        amount_minor: 50000,
        currency: 'RSD',
        recurrence: 'recurring',
        confidence: 'confirmed',
        start_date: '2026-01-01',
        end_date: null,
        sort_order: 0,
        archived: false,
      },
    ]);
    expect(await deleteObligation(client, 'h1', 'o1')).toBe(true);
    expect(db.rows('horizon_obligations')).toHaveLength(0);
  });
});

describe('createObligationSchedule / deleteObligationSchedule', () => {
  it('creates a dayOfMonth schedule with only its relevant fields set', async () => {
    const { client } = fakeSupabase();
    const schedule = await createObligationSchedule(client, 'h1', 'o1', {
      kind: 'dayOfMonth',
      dayOfMonth: 28,
      coversPeriod: 'next',
    });
    expect(schedule).toMatchObject({
      kind: 'dayOfMonth',
      dayOfMonth: 28,
      intervalDays: null,
      anchorDate: null,
      slippagePolicy: 'nextBusinessDay',
      coversPeriod: 'next',
    });
  });

  it('creates an everyNDays schedule with an anchor date', async () => {
    const { client } = fakeSupabase();
    const schedule = await createObligationSchedule(client, 'h1', 'o1', {
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
    db.seed('horizon_obligation_schedules', [
      {
        id: 'sc1',
        household_id: 'h1',
        obligation_id: 'o1',
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
    expect(await deleteObligationSchedule(client, 'h1', 'sc1')).toBe(true);
    expect(await deleteObligationSchedule(client, 'h1', 'sc1')).toBe(false);
  });
});

describe('createDailyExpense', () => {
  it('stores a daily expense with default charge cadence', async () => {
    const { client } = fakeSupabase();
    const expense = await createDailyExpense(client, 'h1', {
      accountId: 'a1',
      name: 'Groceries',
      dailyAmountMinor: 1000,
      currency: 'RSD',
      startDate: '2026-01-01',
    });
    expect(expense).toMatchObject({
      name: 'Groceries',
      chargeCadence: 'daily',
      capMinor: null,
    });
  });
});

describe('updateDailyExpense', () => {
  it('returns null when the daily expense is not in this household', async () => {
    const { client } = fakeSupabase();
    expect(
      await updateDailyExpense(client, 'h1', 'missing', { archived: true })
    ).toBeNull();
  });

  it('patches only the given fields', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_daily_expenses', [
      {
        id: 'de1',
        household_id: 'h1',
        account_id: 'a1',
        pocket_category_id: null,
        name: 'Groceries',
        daily_amount_minor: 1000,
        currency: 'RSD',
        charge_cadence: 'daily',
        cap_minor: null,
        start_date: '2026-01-01',
        end_date: null,
        archived: false,
      },
    ]);
    const updated = await updateDailyExpense(client, 'h1', 'de1', {
      capMinor: 30000,
    });
    expect(updated).toMatchObject({ capMinor: 30000, name: 'Groceries' });
  });
});

describe('deleteDailyExpense', () => {
  it('deletes a matching daily expense', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_daily_expenses', [
      {
        id: 'de1',
        household_id: 'h1',
        account_id: 'a1',
        pocket_category_id: null,
        name: 'Groceries',
        daily_amount_minor: 1000,
        currency: 'RSD',
        charge_cadence: 'daily',
        cap_minor: null,
        start_date: '2026-01-01',
        end_date: null,
        archived: false,
      },
    ]);
    expect(await deleteDailyExpense(client, 'h1', 'de1')).toBe(true);
    expect(db.rows('horizon_daily_expenses')).toHaveLength(0);
  });

  it('returns false when nothing matched', async () => {
    const { client } = fakeSupabase();
    expect(await deleteDailyExpense(client, 'h1', 'missing')).toBe(false);
  });
});

describe('createOneOffEvent', () => {
  it('stores a one-off event', async () => {
    const { client } = fakeSupabase();
    const event = await createOneOffEvent(client, 'h1', {
      accountId: 'a1',
      name: 'Car repair',
      category: 'transport',
      amountMinor: 15000,
      currency: 'RSD',
      date: '2026-02-01',
      direction: 'out',
    });
    expect(event).toMatchObject({
      name: 'Car repair',
      category: 'transport',
      direction: 'out',
    });
  });
});

describe('updateOneOffEvent', () => {
  it('returns null when the event is not in this household', async () => {
    const { client } = fakeSupabase();
    expect(
      await updateOneOffEvent(client, 'h1', 'missing', { amountMinor: 500 })
    ).toBeNull();
  });

  it('patches only the given fields', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_one_off_events', [
      {
        id: 'oo1',
        household_id: 'h1',
        account_id: 'a1',
        name: 'Car repair',
        category: 'transport',
        amount_minor: 15000,
        currency: 'RSD',
        date: '2026-02-01',
        direction: 'out',
      },
    ]);
    const updated = await updateOneOffEvent(client, 'h1', 'oo1', {
      amountMinor: 20000,
    });
    expect(updated).toMatchObject({ amountMinor: 20000, name: 'Car repair' });
  });
});

describe('deleteOneOffEvent', () => {
  it('deletes a matching one-off event', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_one_off_events', [
      {
        id: 'oo1',
        household_id: 'h1',
        account_id: 'a1',
        name: 'Car repair',
        category: 'transport',
        amount_minor: 15000,
        currency: 'RSD',
        date: '2026-02-01',
        direction: 'out',
      },
    ]);
    expect(await deleteOneOffEvent(client, 'h1', 'oo1')).toBe(true);
    expect(db.rows('horizon_one_off_events')).toHaveLength(0);
  });

  it('returns false when nothing matched', async () => {
    const { client } = fakeSupabase();
    expect(await deleteOneOffEvent(client, 'h1', 'missing')).toBe(false);
  });
});
