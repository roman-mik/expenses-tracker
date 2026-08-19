/**
 * Horizon income constraint behavior against real Postgres — the check
 * constraints and FK cascades a mock DB (fake-supabase.ts) can't surface.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  admin,
  makeUser,
  destroyUser,
  type TestUser,
} from '@/test/setup-integration';
import { createHorizonAccount } from '@/lib/horizon/mutations/accounts';
import {
  createIncomeSchedule,
  createIncomeStream,
} from '@/lib/horizon/mutations/income';
import {
  getIncomeSchedules,
  getIncomeStreams,
} from '@/lib/horizon/queries/income';

let alice: TestUser;
let accountId: string;

beforeAll(async () => {
  alice = await makeUser('income-alice');
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

describe('horizon_income_streams check constraints', () => {
  it('rejects an hourly stream missing rate/hours', async () => {
    const { error } = await alice.client.from('horizon_income_streams').insert({
      household_id: alice.householdId,
      account_id: accountId,
      name: 'Bad hourly',
      kind: 'hourly',
      currency: 'RSD',
      start_date: '2026-01-01',
    });
    expect(error).not.toBeNull();
  });

  it('rejects a fixed stream missing the fixed amount', async () => {
    const { error } = await alice.client.from('horizon_income_streams').insert({
      household_id: alice.householdId,
      account_id: accountId,
      name: 'Bad fixed',
      kind: 'fixed',
      currency: 'RSD',
      start_date: '2026-01-01',
    });
    expect(error).not.toBeNull();
  });

  it('rejects an unsupported kind', async () => {
    await expect(
      createIncomeStream(alice.client, alice.householdId, {
        kind: 'salary' as never,
        accountId,
        name: 'Bad kind',
        currency: 'RSD',
        fixedAmountMinor: 1000,
        startDate: '2026-01-01',
      })
    ).rejects.toThrow();
  });

  it('rejects an end date before the start date', async () => {
    const { error } = await alice.client.from('horizon_income_streams').insert({
      household_id: alice.householdId,
      account_id: accountId,
      name: 'Backwards',
      kind: 'fixed',
      currency: 'RSD',
      fixed_amount_minor: 1000,
      start_date: '2026-06-01',
      end_date: '2026-01-01',
    });
    expect(error).not.toBeNull();
  });
});

describe('horizon_accounts.on delete cascade', () => {
  it('deleting the account deletes its income streams', async () => {
    const account = await createHorizonAccount(
      alice.client,
      alice.householdId,
      {
        name: 'Temp',
        currency: 'RSD',
        type: 'personal',
      }
    );
    const stream = await createIncomeStream(alice.client, alice.householdId, {
      kind: 'fixed',
      accountId: account.id,
      name: 'Temp income',
      currency: 'RSD',
      fixedAmountMinor: 1000,
      startDate: '2026-01-01',
    });

    const { error } = await alice.client
      .from('horizon_accounts')
      .delete()
      .eq('id', account.id);
    expect(error).toBeNull();

    const remaining = await getIncomeStreams(alice.client, alice.householdId);
    expect(remaining.find((s) => s.id === stream.id)).toBeUndefined();
  });
});

describe('horizon_income_streams.on delete cascade', () => {
  it('deleting the stream deletes its schedules', async () => {
    const stream = await createIncomeStream(alice.client, alice.householdId, {
      kind: 'fixed',
      accountId,
      name: 'With schedule',
      currency: 'RSD',
      fixedAmountMinor: 1000,
      startDate: '2026-01-01',
    });
    await createIncomeSchedule(alice.client, alice.householdId, stream.id, {
      kind: 'dayOfMonth',
      dayOfMonth: 15,
    });

    const { error } = await alice.client
      .from('horizon_income_streams')
      .delete()
      .eq('id', stream.id);
    expect(error).toBeNull();

    const remaining = await getIncomeSchedules(alice.client, alice.householdId);
    expect(remaining.some((s) => s.incomeStreamId === stream.id)).toBe(false);
  });
});

describe('households.on delete cascade', () => {
  it('deleting the household deletes its work calendar, holidays, and income streams', async () => {
    const bob = await makeUser('income-cascade-bob');
    const bobAccount = await createHorizonAccount(bob.client, bob.householdId, {
      name: 'Checking',
      currency: 'RSD',
      type: 'personal',
    });
    await createIncomeStream(bob.client, bob.householdId, {
      kind: 'fixed',
      accountId: bobAccount.id,
      name: 'Bob income',
      currency: 'RSD',
      fixedAmountMinor: 1000,
      startDate: '2026-01-01',
    });
    await bob.client
      .from('horizon_work_calendars')
      .upsert({ household_id: bob.householdId, working_weekdays: [1, 2, 3] });
    await bob.client.from('horizon_holidays').insert({
      household_id: bob.householdId,
      date: '2026-01-01',
      name: 'Test',
    });

    // authenticated has no delete grant on households (0006_table_grants.sql)
    // — deleting a household is not a user-facing action, so this exercises
    // the FK cascade via service_role.
    const { error } = await admin
      .from('households')
      .delete()
      .eq('id', bob.householdId);
    expect(error).toBeNull();

    expect(await getIncomeStreams(admin, bob.householdId)).toEqual([]);

    const { data: calendars } = await admin
      .from('horizon_work_calendars')
      .select('household_id')
      .eq('household_id', bob.householdId);
    expect(calendars).toEqual([]);

    const { data: holidays } = await admin
      .from('horizon_holidays')
      .select('id')
      .eq('household_id', bob.householdId);
    expect(holidays).toEqual([]);

    await destroyUser(bob);
  });
});
