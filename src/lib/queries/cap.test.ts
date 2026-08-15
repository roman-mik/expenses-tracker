import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import { getCap } from './cap';

describe('getCap', () => {
  it('returns null when the household has no budget_settings row yet', async () => {
    const { client } = fakeSupabase();
    expect(await getCap(client, 'household-1')).toBeNull();
  });

  it('maps the row to BudgetSettings', async () => {
    const { client, db } = fakeSupabase();
    db.seed('budget_settings', [
      {
        household_id: 'household-1',
        monthly_cap: 100_000,
        nudge_enabled: true,
        nudge_pct: 80,
      },
    ]);
    expect(await getCap(client, 'household-1')).toEqual({
      monthlyCap: 100_000,
      nudgeEnabled: true,
      nudgePct: 80,
    });
  });

  it('is scoped to the given household', async () => {
    const { client, db } = fakeSupabase();
    db.seed('budget_settings', [
      {
        household_id: 'other-household',
        monthly_cap: 50_000,
        nudge_enabled: true,
        nudge_pct: 80,
      },
    ]);
    expect(await getCap(client, 'household-1')).toBeNull();
  });

  it('throws a plain Error on a DB error', async () => {
    const { client, db } = fakeSupabase();
    db.failNext('budget_settings', 'connection lost');
    await expect(getCap(client, 'household-1')).rejects.toThrow(
      'connection lost'
    );
  });
});
