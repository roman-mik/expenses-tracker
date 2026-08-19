import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import { getHorizonSettings } from './settings';

describe('getHorizonSettings', () => {
  it('returns the household reporting currency', async () => {
    const { client, db } = fakeSupabase();
    db.seed('households', [
      { id: 'h1', currency: 'RSD', horizon_reporting_currency: 'EUR' },
    ]);
    expect(await getHorizonSettings(client, 'h1')).toEqual({
      reportingCurrency: 'EUR',
    });
  });

  it('falls back to RSD when the household row is missing', async () => {
    const { client } = fakeSupabase();
    expect(await getHorizonSettings(client, 'missing')).toEqual({
      reportingCurrency: 'RSD',
    });
  });
});
