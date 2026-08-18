import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import { getLedgerFxRates } from './fx';

describe('getLedgerFxRates', () => {
  it('returns every snapshot, newest first, with no household scoping', async () => {
    const { client, db } = fakeSupabase();
    db.seed('ledger_fx_rates', [
      {
        base_code: 'EUR',
        quote_code: 'RSD',
        rate_e8: 10_000_000_000,
        as_of_date: '2026-08-01',
        source: 'test-provider',
        fetched_at: '2026-08-01T05:00:00.000Z',
      },
      {
        base_code: 'EUR',
        quote_code: 'RSD',
        rate_e8: 10_050_000_000,
        as_of_date: '2026-08-15',
        source: 'test-provider',
        fetched_at: '2026-08-15T05:00:00.000Z',
      },
    ]);

    const rates = await getLedgerFxRates(client);
    expect(rates.map((r) => r.asOfDate)).toEqual(['2026-08-15', '2026-08-01']);
    expect(rates[0].rateE8).toBe(10_050_000_000);
  });

  it('returns an empty list when no snapshots exist yet', async () => {
    const { client } = fakeSupabase();
    expect(await getLedgerFxRates(client)).toEqual([]);
  });
});
