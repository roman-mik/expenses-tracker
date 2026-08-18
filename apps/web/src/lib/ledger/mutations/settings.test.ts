import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import { updateLedgerReportingCurrency } from './settings';

describe('updateLedgerReportingCurrency', () => {
  it('updates the reporting currency, leaving currency untouched (D15)', async () => {
    const { client, db } = fakeSupabase();
    db.seed('households', [
      { id: 'h1', currency: 'RSD', ledger_reporting_currency: 'RSD' },
    ]);
    const result = await updateLedgerReportingCurrency(client, 'h1', {
      reportingCurrency: 'EUR',
    });
    expect(result).toEqual({ reportingCurrency: 'EUR' });
    expect(db.rows('households')[0].currency).toBe('RSD');
  });

  it('returns null when the household id does not match', async () => {
    const { client } = fakeSupabase();
    expect(
      await updateLedgerReportingCurrency(client, 'missing', {
        reportingCurrency: 'EUR',
      })
    ).toBeNull();
  });
});
