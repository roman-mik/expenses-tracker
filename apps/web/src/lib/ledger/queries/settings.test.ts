import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import { getLedgerSettings } from './settings';

describe('getLedgerSettings', () => {
  it('returns the household reporting currency', async () => {
    const { client, db } = fakeSupabase();
    db.seed('households', [
      { id: 'h1', currency: 'RSD', ledger_reporting_currency: 'EUR' },
    ]);
    expect(await getLedgerSettings(client, 'h1')).toEqual({
      reportingCurrency: 'EUR',
    });
  });

  it('falls back to RSD when the household row is missing', async () => {
    const { client } = fakeSupabase();
    expect(await getLedgerSettings(client, 'missing')).toEqual({
      reportingCurrency: 'RSD',
    });
  });
});
