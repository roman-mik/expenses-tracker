/**
 * Ledger balance snapshots constraint behavior against real Postgres.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeUser, destroyUser, type TestUser } from '@/test/setup-integration';
import { createLedgerAccount } from '@/lib/ledger/mutations/accounts';
import { reconcileLedgerBalances } from '@/lib/ledger/mutations/balances';
import { getLedgerBalanceSnapshots } from '@/lib/ledger/queries/balances';

let alice: TestUser;

beforeAll(async () => {
  alice = await makeUser('ledger-balances-alice');
});

afterAll(async () => {
  await destroyUser(alice);
});

describe('ledger_balance_snapshots check constraints and FK cascade', () => {
  it('rejects an unsupported currency in snapshot', async () => {
    const acc = await createLedgerAccount(alice.client, alice.householdId, {
      name: 'Checking',
      currency: 'RSD',
      type: 'personal',
    });

    const { error } = await alice.client
      .from('ledger_balance_snapshots')
      .insert({
        household_id: alice.householdId,
        account_id: acc.id,
        balance_minor: 100,
        expected_minor: 0,
        currency: 'CAD',
      });

    expect(error).not.toBeNull();
  });

  it('cascades deletion when account is deleted', async () => {
    const acc = await createLedgerAccount(alice.client, alice.householdId, {
      name: 'Temp account',
      currency: 'EUR',
      type: 'personal',
    });

    await reconcileLedgerBalances(alice.client, alice.householdId, [
      { accountId: acc.id, balanceMinor: 500 },
    ]);

    let snapshots = await getLedgerBalanceSnapshots(
      alice.client,
      alice.householdId,
      {
        accountId: acc.id,
      }
    );
    expect(snapshots).toHaveLength(1);

    // Delete the account
    const { error } = await alice.client
      .from('ledger_accounts')
      .delete()
      .eq('id', acc.id);
    expect(error).toBeNull();

    snapshots = await getLedgerBalanceSnapshots(
      alice.client,
      alice.householdId,
      {
        accountId: acc.id,
      }
    );
    expect(snapshots).toHaveLength(0);
  });
});
