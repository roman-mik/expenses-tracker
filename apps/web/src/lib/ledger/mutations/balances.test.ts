import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import { reconcileLedgerBalances } from './balances';
import { getLedgerBalanceSnapshots } from '../queries/balances';

describe('reconcileLedgerBalances', () => {
  it('creates balance snapshots and updates current_balance_minor on accounts', async () => {
    const { client, db } = fakeSupabase();
    db.seed('ledger_accounts', [
      {
        id: 'a1',
        household_id: 'h1',
        name: 'Checking',
        currency: 'EUR',
        current_balance_minor: 1000,
        type: 'personal',
        include_in_total: true,
        sort_order: 0,
        archived: false,
      },
      {
        id: 'a2',
        household_id: 'h1',
        name: 'Savings',
        currency: 'RSD',
        current_balance_minor: 5000,
        type: 'savings',
        include_in_total: true,
        sort_order: 1,
        archived: false,
      },
    ]);

    const snapshots = await reconcileLedgerBalances(client, 'h1', [
      { accountId: 'a1', balanceMinor: 1200, note: 'Salary arrived' },
      { accountId: 'a2', balanceMinor: 4800 },
    ]);

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toMatchObject({
      accountId: 'a1',
      balanceMinor: 1200,
      expectedMinor: 1000,
      varianceMinor: 200,
      currency: 'EUR',
      note: 'Salary arrived',
    });
    expect(snapshots[1]).toMatchObject({
      accountId: 'a2',
      balanceMinor: 4800,
      expectedMinor: 5000,
      varianceMinor: -200,
      currency: 'RSD',
      note: null,
    });

    // Check account balances updated in DB
    const accountRows = db.rows('ledger_accounts');
    expect(accountRows.find((r) => r.id === 'a1')?.current_balance_minor).toBe(
      1200
    );
    expect(accountRows.find((r) => r.id === 'a2')?.current_balance_minor).toBe(
      4800
    );

    // Verify query returns inserted snapshots
    const history = await getLedgerBalanceSnapshots(client, 'h1');
    expect(history).toHaveLength(2);
  });

  it('throws an error when an account is not in the household', async () => {
    const { client, db } = fakeSupabase();
    db.seed('ledger_accounts', [
      {
        id: 'a1',
        household_id: 'other',
        name: 'Checking',
        currency: 'EUR',
        current_balance_minor: 1000,
        type: 'personal',
        include_in_total: true,
        sort_order: 0,
        archived: false,
      },
    ]);

    await expect(
      reconcileLedgerBalances(client, 'h1', [
        { accountId: 'a1', balanceMinor: 1500 },
      ])
    ).rejects.toThrow('Account a1 not found.');
  });
});
