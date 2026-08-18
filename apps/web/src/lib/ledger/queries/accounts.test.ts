import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import { getLedgerAccounts } from './accounts';

describe('getLedgerAccounts', () => {
  it('returns accounts for the household, ordered by sort_order', async () => {
    const { client, db } = fakeSupabase();
    db.seed('ledger_accounts', [
      {
        id: 'a2',
        household_id: 'h1',
        name: 'Savings',
        currency: 'EUR',
        current_balance_minor: 500,
        type: 'savings',
        include_in_total: true,
        sort_order: 1,
        archived: false,
      },
      {
        id: 'a1',
        household_id: 'h1',
        name: 'Checking',
        currency: 'RSD',
        current_balance_minor: -200,
        type: 'personal',
        include_in_total: true,
        sort_order: 0,
        archived: false,
      },
      {
        id: 'a3',
        household_id: 'other',
        name: 'Not mine',
        currency: 'USD',
        current_balance_minor: 0,
        type: 'business',
        include_in_total: true,
        sort_order: 0,
        archived: false,
      },
    ]);

    const accounts = await getLedgerAccounts(client, 'h1');
    expect(accounts.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(accounts[0].currentBalanceMinor).toBe(-200);
  });

  it('returns an empty list when the household has no accounts', async () => {
    const { client } = fakeSupabase();
    expect(await getLedgerAccounts(client, 'h1')).toEqual([]);
  });
});
