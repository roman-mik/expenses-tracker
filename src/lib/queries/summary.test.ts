import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import { getSummary } from './summary';

describe('getSummary', () => {
  it('computes the full derived-value set for a healthy month', async () => {
    const { client, db } = fakeSupabase();
    db.seed('households', [
      { id: 'h1', currency: 'RSD', timezone: 'Europe/Belgrade' },
    ]);
    db.seed('budget_settings', [
      {
        household_id: 'h1',
        monthly_cap: 100_000,
        nudge_enabled: true,
        nudge_pct: 80,
      },
    ]);
    db.seed('expenses', [
      {
        household_id: 'h1',
        category_id: 'groceries',
        amount_minor: 10_000,
        currency: 'RSD',
        spent_at: '2026-08-05T10:00:00.000Z',
      },
      {
        household_id: 'h1',
        category_id: 'fun',
        amount_minor: 5_000,
        currency: 'RSD',
        spent_at: '2026-08-06T10:00:00.000Z',
      },
    ]);

    // Fixed "now": Aug 10 in Belgrade (August has 31 days).
    const now = new Date('2026-08-10T10:00:00.000Z');
    const summary = await getSummary(client, 'h1', '2026-08', now);

    expect(summary.currency).toBe('RSD');
    expect(summary.cap).toBe(100_000);
    expect(summary.spent).toBe(15_000);
    expect(summary.remaining).toBe(85_000);
    expect(summary.overspend).toBe(0);
    expect(summary.nudgeEnabled).toBe(true);
    expect(summary.nudgePct).toBe(80);
    expect(summary.categoryBreakdown).toEqual(
      expect.arrayContaining([
        { categoryId: 'groceries', spent: 10_000 },
        { categoryId: 'fun', spent: 5_000 },
      ])
    );
  });

  it('excludes expenses outside the household currency from spend, buckets them separately', async () => {
    const { client, db } = fakeSupabase();
    db.seed('households', [
      { id: 'h1', currency: 'RSD', timezone: 'Europe/Belgrade' },
    ]);
    db.seed('budget_settings', [
      {
        household_id: 'h1',
        monthly_cap: 100_000,
        nudge_enabled: true,
        nudge_pct: 80,
      },
    ]);
    db.seed('expenses', [
      {
        household_id: 'h1',
        category_id: null,
        amount_minor: 1_000,
        currency: 'RSD',
        spent_at: '2026-08-05T10:00:00.000Z',
      },
      {
        household_id: 'h1',
        category_id: null,
        amount_minor: 50,
        currency: 'EUR',
        spent_at: '2026-08-05T10:00:00.000Z',
      },
    ]);
    const summary = await getSummary(
      client,
      'h1',
      '2026-08',
      new Date('2026-08-10T10:00:00.000Z')
    );
    expect(summary.spent).toBe(1_000);
    expect(summary.otherCurrencies).toEqual([{ currency: 'EUR', spent: 50 }]);
  });

  it('reports overspend once spend exceeds the cap', async () => {
    const { client, db } = fakeSupabase();
    db.seed('households', [
      { id: 'h1', currency: 'RSD', timezone: 'Europe/Belgrade' },
    ]);
    db.seed('budget_settings', [
      {
        household_id: 'h1',
        monthly_cap: 10_000,
        nudge_enabled: true,
        nudge_pct: 80,
      },
    ]);
    db.seed('expenses', [
      {
        household_id: 'h1',
        category_id: null,
        amount_minor: 12_000,
        currency: 'RSD',
        spent_at: '2026-08-05T10:00:00.000Z',
      },
    ]);
    const summary = await getSummary(
      client,
      'h1',
      '2026-08',
      new Date('2026-08-10T10:00:00.000Z')
    );
    expect(summary.overspend).toBe(2_000);
    expect(summary.remaining).toBe(0);
  });

  it('defaults nudge settings and a zero cap when budget_settings has no row yet', async () => {
    const { client, db } = fakeSupabase();
    db.seed('households', [
      { id: 'h1', currency: 'RSD', timezone: 'Europe/Belgrade' },
    ]);
    const summary = await getSummary(
      client,
      'h1',
      '2026-08',
      new Date('2026-08-10T10:00:00.000Z')
    );
    expect(summary.cap).toBe(0);
    expect(summary.nudgeEnabled).toBe(true);
    expect(summary.nudgePct).toBe(80);
  });
});
