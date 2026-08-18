/**
 * Ledger account constraint behavior against real Postgres — the check
 * constraints and FK cascade a mock DB (fake-supabase.ts) can't surface.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  admin,
  makeUser,
  destroyUser,
  type TestUser,
} from '@/test/setup-integration';
import { createLedgerAccount } from '@/lib/ledger/mutations/accounts';
import { getLedgerAccounts } from '@/lib/ledger/queries/accounts';

let alice: TestUser;

beforeAll(async () => {
  alice = await makeUser('ledger-alice');
});

afterAll(async () => {
  await destroyUser(alice);
});

describe('ledger_accounts check constraints', () => {
  it('rejects an unsupported currency', async () => {
    await expect(
      createLedgerAccount(alice.client, alice.householdId, {
        name: 'Checking',
        currency: 'GBP' as never,
        type: 'personal',
      })
    ).rejects.toThrow();
  });

  it('rejects an unsupported account type', async () => {
    await expect(
      createLedgerAccount(alice.client, alice.householdId, {
        name: 'Checking',
        currency: 'RSD',
        type: 'joint' as never,
      })
    ).rejects.toThrow();
  });

  it('rejects a blank name', async () => {
    await expect(
      createLedgerAccount(alice.client, alice.householdId, {
        name: '   ',
        currency: 'RSD',
        type: 'personal',
      })
    ).rejects.toThrow();
  });

  it('allows a negative balance (overdraft) — no sign check', async () => {
    const account = await createLedgerAccount(alice.client, alice.householdId, {
      name: 'Overdrawn',
      currency: 'RSD',
      type: 'personal',
      currentBalanceMinor: -500,
    });
    expect(account.currentBalanceMinor).toBe(-500);
  });
});

describe('households.on delete cascade', () => {
  it('deleting the household deletes its ledger accounts', async () => {
    const bob = await makeUser('ledger-cascade-bob');
    await createLedgerAccount(bob.client, bob.householdId, {
      name: 'Checking',
      currency: 'RSD',
      type: 'personal',
    });

    // authenticated has no delete grant on households (0006_table_grants.sql)
    // — deleting a household is not a user-facing action, so this exercises
    // the FK cascade via service_role, the only role that can trigger it.
    const { error } = await admin
      .from('households')
      .delete()
      .eq('id', bob.householdId);
    expect(error).toBeNull();

    const remaining = await getLedgerAccounts(admin, bob.householdId);
    expect(remaining).toEqual([]);

    await destroyUser(bob);
  });
});
