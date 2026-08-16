/**
 * Tenant isolation, exercised against real Postgres with a real per-user JWT
 * — the layer `fake-supabase.ts` (no concept of RLS) and the route-handler
 * unit tests (mock auth entirely) cannot cover. Every function under test
 * already takes the Supabase client as its first argument, so this reuses
 * production code unchanged — only the client differs from a unit test.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeUser, destroyUser, type TestUser } from '@/test/setup-integration';
import { listExpenses } from '@/lib/queries/expenses';
import { getCategories } from '@/lib/queries/categories';
import { getCap } from '@/lib/queries/cap';
import { getSummary } from '@/lib/queries/summary';
import { getHouseholdMembers } from '@/lib/queries/household';
import {
  createExpense,
  updateExpense,
  deleteExpense,
} from '@/lib/mutations/expenses';
import { upsertCap } from '@/lib/mutations/cap';

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  alice = await makeUser('iso-alice');
  bob = await makeUser('iso-bob');
});

afterAll(async () => {
  await destroyUser(alice);
  await destroyUser(bob);
});

describe('cross-household read isolation', () => {
  it('listExpenses returns nothing for a foreign household', async () => {
    await createExpense(alice.client, alice.householdId, alice.id, {
      amountMinor: 1000,
      note: 'alice groceries',
    });
    expect(await listExpenses(bob.client, alice.householdId)).toEqual([]);
  });

  it('getCategories returns nothing for a foreign household', async () => {
    expect(await getCategories(bob.client, alice.householdId)).toEqual([]);
  });

  it('getCap returns null for a foreign household', async () => {
    await upsertCap(alice.client, alice.householdId, { monthlyCap: 50000 });
    expect(await getCap(bob.client, alice.householdId)).toBeNull();
  });

  it('getSummary reads a zeroed summary for a foreign household', async () => {
    const summary = await getSummary(bob.client, alice.householdId, '2026-08');
    expect(summary.spent).toBe(0);
  });

  it('getHouseholdMembers returns nothing for a foreign household', async () => {
    expect(await getHouseholdMembers(bob.client, alice.householdId)).toEqual(
      []
    );
  });
});

describe('cross-household write isolation', () => {
  it('updateExpense on a foreign expense is a no-op, row unchanged', async () => {
    const created = await createExpense(
      alice.client,
      alice.householdId,
      alice.id,
      { amountMinor: 2500, note: 'original' }
    );

    const result = await updateExpense(
      bob.client,
      bob.householdId,
      created.id,
      {
        note: 'tampered',
      }
    );
    expect(result).toBeNull();

    const untouched = (
      await listExpenses(alice.client, alice.householdId)
    ).find((e) => e.id === created.id);
    expect(untouched?.note).toBe('original');
  });

  it('deleteExpense on a foreign expense returns false, row still present', async () => {
    const created = await createExpense(
      alice.client,
      alice.householdId,
      alice.id,
      { amountMinor: 300 }
    );

    expect(await deleteExpense(bob.client, bob.householdId, created.id)).toBe(
      false
    );

    expect(
      (await listExpenses(alice.client, alice.householdId)).some(
        (e) => e.id === created.id
      )
    ).toBe(true);
  });

  it('createExpense into a foreign household throws', async () => {
    await expect(
      createExpense(bob.client, alice.householdId, bob.id, {
        amountMinor: 100,
      })
    ).rejects.toThrow();
  });

  it("upsertCap on a foreign household throws, and the household's cap is unchanged", async () => {
    await expect(
      upsertCap(bob.client, alice.householdId, { monthlyCap: 1 })
    ).rejects.toThrow();

    const cap = await getCap(alice.client, alice.householdId);
    expect(cap?.monthlyCap).toBe(50000);
  });
});
