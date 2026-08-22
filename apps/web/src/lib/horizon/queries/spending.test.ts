import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import {
  getObligations,
  getObligationSchedules,
  getSchedulesForObligation,
} from './spending';

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
