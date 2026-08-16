/**
 * Concurrent-edit and constraint behavior against real Postgres — the
 * failure modes a mock DB (fake-supabase.ts has no constraints, triggers, or
 * FKs) can't surface at all.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeUser, destroyUser, type TestUser } from '@/test/setup-integration';
import { createExpense, updateExpense } from '@/lib/mutations/expenses';
import { createCategory } from '@/lib/mutations/categories';
import { listExpenses, getExpense } from '@/lib/queries/expenses';

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  alice = await makeUser('con-alice');
  bob = await makeUser('con-bob');

  // Share a household: mint+redeem an invite so alice and bob are co-members
  // for the "same household" cases below.
  const { createInvite, joinHousehold } =
    await import('@/lib/mutations/household');
  const code = await createInvite(alice.client, alice.householdId, alice.id);
  await joinHousehold(bob.client, code);
});

afterAll(async () => {
  await destroyUser(alice);
  await destroyUser(bob);
});

describe('concurrent edits within a shared household', () => {
  it('two co-members editing the same expense: neither throws, last write wins deterministically', async () => {
    const created = await createExpense(
      alice.client,
      alice.householdId,
      alice.id,
      { amountMinor: 1000, note: 'race' }
    );

    const [aliceResult, bobResult] = await Promise.all([
      updateExpense(alice.client, alice.householdId, created.id, {
        note: 'alice wrote this',
      }),
      updateExpense(bob.client, alice.householdId, created.id, {
        note: 'bob wrote this',
      }),
    ]);

    expect(aliceResult).not.toBeNull();
    expect(bobResult).not.toBeNull();

    const final = await getExpense(alice.client, alice.householdId, created.id);
    expect(['alice wrote this', 'bob wrote this']).toContain(final?.note);
  });
});

describe('foreign-key and check-constraint behavior', () => {
  it("deleting a category leaves its expenses with category_id null (doesn't cascade-delete the expense)", async () => {
    const category = await createCategory(alice.client, alice.householdId, {
      name: 'Temp',
      color: 'sage-500',
    });
    const expense = await createExpense(
      alice.client,
      alice.householdId,
      alice.id,
      { amountMinor: 500, categoryId: category.id }
    );

    // No deleteCategory mutation exists (archive-only in the app layer) —
    // delete the row directly to exercise the FK's ON DELETE SET NULL.
    const { error } = await alice.client
      .from('categories')
      .delete()
      .eq('id', category.id);
    expect(error).toBeNull();

    const survivor = await getExpense(
      alice.client,
      alice.householdId,
      expense.id
    );
    expect(survivor).not.toBeNull();
    expect(survivor?.categoryId).toBeNull();
  });

  it('a negative amount_minor is rejected by the DB check constraint as a clean thrown Error', async () => {
    await expect(
      createExpense(alice.client, alice.householdId, alice.id, {
        amountMinor: -100,
      })
    ).rejects.toThrow();

    // Confirm nothing partial was written.
    const all = await listExpenses(alice.client, alice.householdId);
    expect(all.every((e) => e.amountMinor >= 0)).toBe(true);
  });
});
