import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import { upsertCap } from './cap';

describe('upsertCap', () => {
  it('creates a row when the household has none yet', async () => {
    const { client } = fakeSupabase();
    // The fake DB has no column defaults (unlike real Postgres), so nudge
    // fields must be given explicitly here to assert the row round-trips.
    const result = await upsertCap(client, 'h1', {
      monthlyCap: 100_000,
      nudgeEnabled: true,
      nudgePct: 80,
    });
    expect(result).toEqual({
      monthlyCap: 100_000,
      nudgeEnabled: true,
      nudgePct: 80,
    });
  });

  it('updates the existing row rather than creating a second one', async () => {
    const { client, db } = fakeSupabase();
    db.seed('budget_settings', [
      {
        household_id: 'h1',
        monthly_cap: 50_000,
        nudge_enabled: true,
        nudge_pct: 80,
      },
    ]);
    await upsertCap(client, 'h1', { monthlyCap: 120_000, nudgeEnabled: false });
    expect(db.rows('budget_settings')).toHaveLength(1);
    expect(db.rows('budget_settings')[0]).toMatchObject({
      monthly_cap: 120_000,
      nudge_enabled: false,
    });
  });

  it('leaves nudge fields unchanged when omitted from the input', async () => {
    const { client, db } = fakeSupabase();
    db.seed('budget_settings', [
      {
        household_id: 'h1',
        monthly_cap: 50_000,
        nudge_enabled: false,
        nudge_pct: 90,
      },
    ]);
    const result = await upsertCap(client, 'h1', { monthlyCap: 60_000 });
    expect(result).toEqual({
      monthlyCap: 60_000,
      nudgeEnabled: false,
      nudgePct: 90,
    });
  });
});
