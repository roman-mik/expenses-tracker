import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import {
  getDailyExpenses,
  getObligations,
  getObligationSchedules,
  getOneOffEvents,
  getSchedulesForObligation,
  sumPocketExpenses,
} from './spending';

function seedHousehold(db: ReturnType<typeof fakeSupabase>['db'], id = 'h1') {
  db.seed('households', [{ id, currency: 'RSD', timezone: 'Europe/Belgrade' }]);
}

const obligationRow = {
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
};

describe('getObligations', () => {
  it('returns obligations for the household, ordered by sort_order', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_obligations', [
      { ...obligationRow, id: 'o2', sort_order: 1 },
      { ...obligationRow, id: 'o1', sort_order: 0 },
      { ...obligationRow, id: 'o3', household_id: 'other', sort_order: 0 },
    ]);

    const obligations = await getObligations(client, 'h1');
    expect(obligations.map((o) => o.id)).toEqual(['o1', 'o2']);
    expect(obligations[0]).toMatchObject({
      category: 'housing',
      amountMinor: 50000,
    });
  });

  it('returns an empty list when the household has no obligations', async () => {
    const { client } = fakeSupabase();
    expect(await getObligations(client, 'h1')).toEqual([]);
  });
});

describe('getObligationSchedules / getSchedulesForObligation', () => {
  const schedule28th = {
    id: 'sc1',
    household_id: 'h1',
    obligation_id: 'o1',
    kind: 'dayOfMonth',
    day_of_month: 28,
    interval_days: null,
    nth_weekday: null,
    weekday: null,
    anchor_date: null,
    slippage_policy: 'nextBusinessDay',
    covers_period: 'next',
  };
  const scheduleMonthEnd = {
    ...schedule28th,
    id: 'sc2',
    kind: 'monthEnd',
    day_of_month: null,
  };

  it('returns every schedule in the household across obligations', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_obligation_schedules', [
      schedule28th,
      scheduleMonthEnd,
      { ...schedule28th, id: 'sc3', household_id: 'other' },
    ]);

    const all = await getObligationSchedules(client, 'h1');
    expect(all.map((s) => s.id).sort()).toEqual(['sc1', 'sc2']);
  });

  it('scopes to a single obligation', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_obligation_schedules', [
      schedule28th,
      scheduleMonthEnd,
      { ...schedule28th, id: 'sc3', obligation_id: 'o2' },
    ]);

    const forO1 = await getSchedulesForObligation(client, 'h1', 'o1');
    expect(forO1.map((s) => s.id).sort()).toEqual(['sc1', 'sc2']);
  });
});

const dailyExpenseRow = {
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
};

describe('getDailyExpenses', () => {
  it('returns daily expenses for the household, ordered by start_date', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_daily_expenses', [
      { ...dailyExpenseRow, id: 'de2', start_date: '2026-02-01' },
      { ...dailyExpenseRow, id: 'de1', start_date: '2026-01-01' },
      { ...dailyExpenseRow, id: 'de3', household_id: 'other' },
    ]);

    const expenses = await getDailyExpenses(client, 'h1');
    expect(expenses.map((e) => e.id)).toEqual(['de1', 'de2']);
    expect(expenses[0]).toMatchObject({ dailyAmountMinor: 1000 });
  });
});

const oneOffRow = {
  id: 'oo1',
  household_id: 'h1',
  account_id: 'a1',
  name: 'Car repair',
  category: 'transport',
  amount_minor: 15000,
  currency: 'RSD',
  date: '2026-02-01',
  direction: 'out',
};

describe('getOneOffEvents', () => {
  it('returns one-off events for the household, ordered by date', async () => {
    const { client, db } = fakeSupabase();
    db.seed('horizon_one_off_events', [
      { ...oneOffRow, id: 'oo2', date: '2026-03-01' },
      { ...oneOffRow, id: 'oo1', date: '2026-01-01' },
      { ...oneOffRow, id: 'oo3', household_id: 'other' },
    ]);

    const events = await getOneOffEvents(client, 'h1');
    expect(events.map((e) => e.id)).toEqual(['oo1', 'oo2']);
  });
});

describe('sumPocketExpenses', () => {
  it('returns 0 without a Pocket category, and never queries expenses', async () => {
    const { client, db } = fakeSupabase();
    seedHousehold(db);
    db.failNext('expenses', 'should not be called');
    expect(await sumPocketExpenses(client, 'h1', null, '2026-08')).toBe(0);
  });

  it('sums matching expenses within the household month window', async () => {
    const { client, db } = fakeSupabase();
    seedHousehold(db);
    db.seed('expenses', [
      {
        id: 'e1',
        household_id: 'h1',
        category_id: 'cat-1',
        amount_minor: 1000,
        currency: 'RSD',
        note: null,
        spent_at: '2026-08-05T00:00:00.000Z',
        user_id: 'u1',
      },
      {
        id: 'e2',
        household_id: 'h1',
        category_id: 'cat-1',
        amount_minor: 2000,
        currency: 'RSD',
        note: null,
        spent_at: '2026-08-15T00:00:00.000Z',
        user_id: 'u1',
      },
      {
        id: 'e3',
        household_id: 'h1',
        category_id: 'cat-other',
        amount_minor: 5000,
        currency: 'RSD',
        note: null,
        spent_at: '2026-08-10T00:00:00.000Z',
        user_id: 'u1',
      },
      {
        id: 'e4',
        household_id: 'h1',
        category_id: 'cat-1',
        amount_minor: 9000,
        currency: 'RSD',
        note: null,
        spent_at: '2026-09-01T00:00:00.000Z',
        user_id: 'u1',
      },
    ]);

    expect(await sumPocketExpenses(client, 'h1', 'cat-1', '2026-08')).toBe(
      3000
    );
  });
});
