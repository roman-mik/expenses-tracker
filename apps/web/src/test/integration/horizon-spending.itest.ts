/**
 * Horizon obligation/spending constraint behavior against real Postgres —
 * the check constraints and FK cascades a mock DB (fake-supabase.ts) can't
 * surface, plus `sumPocketExpenses`'s real timezone-aware month window.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  admin,
  makeUser,
  destroyUser,
  type TestUser,
} from '@/test/setup-integration';
import { createHorizonAccount } from '@/lib/horizon/mutations/accounts';
import { createCategory } from '@/lib/mutations/categories';
import { createExpense } from '@/lib/mutations/expenses';
import {
  createDailyExpense,
  createObligation,
  createObligationSchedule,
  createOneOffEvent,
} from '@/lib/horizon/mutations/spending';
import {
  getDailyExpenses,
  getObligationSchedules,
  getObligations,
  getOneOffEvents,
  sumPocketExpenses,
} from '@/lib/horizon/queries/spending';

let alice: TestUser;
let accountId: string;

beforeAll(async () => {
  alice = await makeUser('spending-alice');
  const account = await createHorizonAccount(alice.client, alice.householdId, {
    name: 'Checking',
    currency: 'RSD',
    type: 'personal',
  });
  accountId = account.id;
});

afterAll(async () => {
  await destroyUser(alice);
});

describe('horizon_obligations check constraints', () => {
  it('rejects an unsupported category', async () => {
    const { error } = await alice.client.from('horizon_obligations').insert({
      household_id: alice.householdId,
      account_id: accountId,
      name: 'Bad category',
      category: 'not-a-category',
      amount_minor: 1000,
      currency: 'RSD',
      start_date: '2026-01-01',
    });
    expect(error).not.toBeNull();
  });

  it('rejects an end date before the start date', async () => {
    const { error } = await alice.client.from('horizon_obligations').insert({
      household_id: alice.householdId,
      account_id: accountId,
      name: 'Backwards',
      category: 'housing',
      amount_minor: 1000,
      currency: 'RSD',
      start_date: '2026-06-01',
      end_date: '2026-01-01',
    });
    expect(error).not.toBeNull();
  });
});

describe('horizon_accounts.on delete cascade', () => {
  it('deleting the account deletes its obligations', async () => {
    const account = await createHorizonAccount(
      alice.client,
      alice.householdId,
      {
        name: 'Temp',
        currency: 'RSD',
        type: 'personal',
      }
    );
    const obligation = await createObligation(alice.client, alice.householdId, {
      accountId: account.id,
      name: 'Temp obligation',
      category: 'other',
      amountMinor: 1000,
      currency: 'RSD',
      startDate: '2026-01-01',
    });

    const { error } = await alice.client
      .from('horizon_accounts')
      .delete()
      .eq('id', account.id);
    expect(error).toBeNull();

    const remaining = await getObligations(alice.client, alice.householdId);
    expect(remaining.find((o) => o.id === obligation.id)).toBeUndefined();
  });
});

describe('horizon_obligations.on delete cascade', () => {
  it('deleting the obligation deletes its schedules', async () => {
    const obligation = await createObligation(alice.client, alice.householdId, {
      accountId,
      name: 'With schedule',
      category: 'housing',
      amountMinor: 1000,
      currency: 'RSD',
      startDate: '2026-01-01',
    });
    await createObligationSchedule(
      alice.client,
      alice.householdId,
      obligation.id,
      { kind: 'dayOfMonth', dayOfMonth: 28, coversPeriod: 'next' }
    );

    const { error } = await alice.client
      .from('horizon_obligations')
      .delete()
      .eq('id', obligation.id);
    expect(error).toBeNull();

    const remaining = await getObligationSchedules(
      alice.client,
      alice.householdId
    );
    expect(remaining.some((s) => s.obligationId === obligation.id)).toBe(false);
  });
});

describe('households.on delete cascade', () => {
  it('deleting the household deletes its obligations', async () => {
    const bob = await makeUser('spending-cascade-bob');
    const bobAccount = await createHorizonAccount(bob.client, bob.householdId, {
      name: 'Checking',
      currency: 'RSD',
      type: 'personal',
    });
    await createObligation(bob.client, bob.householdId, {
      accountId: bobAccount.id,
      name: 'Bob obligation',
      category: 'housing',
      amountMinor: 1000,
      currency: 'RSD',
      startDate: '2026-01-01',
    });

    // authenticated has no delete grant on households (0006_table_grants.sql)
    // — deleting a household is not a user-facing action, so this exercises
    // the FK cascade via service_role.
    const { error } = await admin
      .from('households')
      .delete()
      .eq('id', bob.householdId);
    expect(error).toBeNull();

    expect(await getObligations(admin, bob.householdId)).toEqual([]);

    await destroyUser(bob);
  });
});

describe('horizon_daily_expenses check constraints', () => {
  it('rejects a non-positive daily amount', async () => {
    const { error } = await alice.client.from('horizon_daily_expenses').insert({
      household_id: alice.householdId,
      account_id: accountId,
      name: 'Free lunch',
      daily_amount_minor: 0,
      currency: 'RSD',
      start_date: '2026-01-01',
    });
    expect(error).not.toBeNull();
  });

  it('rejects an end date before the start date', async () => {
    const { error } = await alice.client.from('horizon_daily_expenses').insert({
      household_id: alice.householdId,
      account_id: accountId,
      name: 'Backwards',
      daily_amount_minor: 1000,
      currency: 'RSD',
      start_date: '2026-06-01',
      end_date: '2026-01-01',
    });
    expect(error).not.toBeNull();
  });
});

describe('horizon_one_off_events check constraints', () => {
  it('rejects a non-positive amount', async () => {
    const { error } = await alice.client.from('horizon_one_off_events').insert({
      household_id: alice.householdId,
      account_id: accountId,
      name: 'Free gift',
      category: 'gift',
      amount_minor: 0,
      currency: 'RSD',
      date: '2026-02-01',
      direction: 'in',
    });
    expect(error).not.toBeNull();
  });
});

describe('horizon_accounts.on delete cascade (daily expenses / one-offs)', () => {
  it('deleting the account deletes its daily expenses and one-off events', async () => {
    const account = await createHorizonAccount(
      alice.client,
      alice.householdId,
      { name: 'Temp2', currency: 'RSD', type: 'personal' }
    );
    const dailyExpense = await createDailyExpense(
      alice.client,
      alice.householdId,
      {
        accountId: account.id,
        name: 'Temp daily expense',
        dailyAmountMinor: 500,
        currency: 'RSD',
        startDate: '2026-01-01',
      }
    );
    const oneOff = await createOneOffEvent(alice.client, alice.householdId, {
      accountId: account.id,
      name: 'Temp one-off',
      category: 'other',
      amountMinor: 1000,
      currency: 'RSD',
      date: '2026-01-01',
      direction: 'out',
    });

    const { error } = await alice.client
      .from('horizon_accounts')
      .delete()
      .eq('id', account.id);
    expect(error).toBeNull();

    const remainingExpenses = await getDailyExpenses(
      alice.client,
      alice.householdId
    );
    expect(
      remainingExpenses.find((e) => e.id === dailyExpense.id)
    ).toBeUndefined();

    const remainingOneOffs = await getOneOffEvents(
      alice.client,
      alice.householdId
    );
    expect(remainingOneOffs.find((e) => e.id === oneOff.id)).toBeUndefined();
  });
});

describe('sumPocketExpenses', () => {
  it('sums the household month window for a linked Pocket category', async () => {
    const category = await createCategory(alice.client, alice.householdId, {
      name: 'Groceries',
      color: 'sage-500',
    });

    await createExpense(alice.client, alice.householdId, alice.id, {
      categoryId: category.id,
      amountMinor: 1000,
      spentAt: '2026-08-05T00:00:00.000Z',
    });
    await createExpense(alice.client, alice.householdId, alice.id, {
      categoryId: category.id,
      amountMinor: 2000,
      spentAt: '2026-08-15T00:00:00.000Z',
    });
    // Outside the window — excluded.
    await createExpense(alice.client, alice.householdId, alice.id, {
      categoryId: category.id,
      amountMinor: 9000,
      spentAt: '2026-09-05T00:00:00.000Z',
    });

    const total = await sumPocketExpenses(
      alice.client,
      alice.householdId,
      category.id,
      '2026-08'
    );
    expect(total).toBe(3000);
  });

  it('returns 0 for a null category without querying expenses', async () => {
    const total = await sumPocketExpenses(
      alice.client,
      alice.householdId,
      null,
      '2026-08'
    );
    expect(total).toBe(0);
  });
});
