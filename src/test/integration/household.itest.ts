/**
 * Invite/join round trip against real Postgres + RLS. join_household() is a
 * SECURITY DEFINER RPC, already covered by pgTAP at the SQL layer
 * (supabase/tests/database/join_household.sql) — this exercises the same
 * invariants through the application code path (mutations/household.ts)
 * with a real per-user JWT, which the pgTAP suite doesn't touch.
 *
 * Each test creates its own users rather than sharing fixtures across tests:
 * joining permanently merges households, so reusing a joiner across tests
 * would leave later tests starting from an already-merged, surprising state.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { makeUser, destroyUser, type TestUser } from '@/test/setup-integration';
import { createExpense } from '@/lib/mutations/expenses';
import { listExpenses } from '@/lib/queries/expenses';
import { getHouseholdMembers } from '@/lib/queries/household';
import {
  createInvite,
  joinHousehold,
  JoinHouseholdException,
} from '@/lib/mutations/household';

const created: TestUser[] = [];
async function user(tag: string): Promise<TestUser> {
  const u = await makeUser(tag);
  created.push(u);
  return u;
}

afterEach(async () => {
  await Promise.all(created.splice(0).map(destroyUser));
});

describe('invite + join round trip', () => {
  it("merges the joiner's data into the invite's household", async () => {
    const alice = await user('hh-alice');
    const bob = await user('hh-bob');
    const carol = await user('hh-carol');
    const bobsOldHousehold = bob.householdId;

    await createExpense(bob.client, bob.householdId, bob.id, {
      amountMinor: 777,
      note: "bob's expense, pre-join",
    });

    const code = await createInvite(alice.client, alice.householdId, alice.id);
    const joinedHouseholdId = await joinHousehold(bob.client, code);

    expect(joinedHouseholdId).toBe(alice.householdId);

    // Bob now sees the merged household, including his pre-join expense
    // carried across.
    const merged = await listExpenses(bob.client, alice.householdId);
    expect(merged.some((e) => e.note === "bob's expense, pre-join")).toBe(true);

    const members = await getHouseholdMembers(alice.client, alice.householdId);
    expect(members.map((m) => m.userId).sort()).toEqual(
      [alice.id, bob.id].sort()
    );

    // Bob's old solo household is gone — he can no longer see anything in it.
    expect(await listExpenses(bob.client, bobsOldHousehold)).toEqual([]);

    // Carol, uninvolved, still sees nothing from either household.
    expect(await listExpenses(carol.client, alice.householdId)).toEqual([]);
  });

  it('a redeemed code cannot be reused by a third user', async () => {
    const alice = await user('hh-alice2');
    const bob = await user('hh-bob2');
    const carol = await user('hh-carol2');

    const code = await createInvite(alice.client, alice.householdId, alice.id);
    await joinHousehold(bob.client, code);

    await expect(joinHousehold(carol.client, code)).rejects.toThrow(
      JoinHouseholdException
    );
  });
});
