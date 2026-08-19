/**
 * Horizon account constraint behavior against real Postgres — the check
 * constraints and FK cascade a mock DB (fake-supabase.ts) can't surface.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  admin,
  makeUser,
  destroyUser,
  type TestUser,
} from '@/test/setup-integration';
import { createHorizonAccount } from '@/lib/horizon/mutations/accounts';
import { getHorizonAccounts } from '@/lib/horizon/queries/accounts';

let alice: TestUser;

beforeAll(async () => {
  alice = await makeUser('horizon-alice');
});

afterAll(async () => {
  await destroyUser(alice);
});

describe('horizon_accounts check constraints', () => {
  it('rejects an unsupported currency', async () => {
    await expect(
      createHorizonAccount(alice.client, alice.householdId, {
        name: 'Checking',
        currency: 'GBP' as never,
        type: 'personal',
      })
    ).rejects.toThrow();
  });

  it('rejects an unsupported account type', async () => {
    await expect(
      createHorizonAccount(alice.client, alice.householdId, {
        name: 'Checking',
        currency: 'RSD',
        type: 'joint' as never,
      })
    ).rejects.toThrow();
  });

  it('rejects a blank name', async () => {
    await expect(
      createHorizonAccount(alice.client, alice.householdId, {
        name: '   ',
        currency: 'RSD',
        type: 'personal',
      })
    ).rejects.toThrow();
  });

  it('allows a negative balance (overdraft) — no sign check', async () => {
    const account = await createHorizonAccount(
      alice.client,
      alice.householdId,
      {
        name: 'Overdrawn',
        currency: 'RSD',
        type: 'personal',
        currentBalanceMinor: -500,
      }
    );
    expect(account.currentBalanceMinor).toBe(-500);
  });
});

describe('households.on delete cascade', () => {
  it('deleting the household deletes its horizon accounts', async () => {
    const bob = await makeUser('horizon-cascade-bob');
    await createHorizonAccount(bob.client, bob.householdId, {
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

    const remaining = await getHorizonAccounts(admin, bob.householdId);
    expect(remaining).toEqual([]);

    await destroyUser(bob);
  });
});
