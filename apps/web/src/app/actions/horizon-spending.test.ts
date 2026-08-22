import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/dal', () => ({
  verifySession: vi.fn(),
  getHouseholdId: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { verifySession, getHouseholdId } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import {
  addDailyExpense,
  addObligation,
  addObligationSchedule,
  addOneOffEvent,
  deleteDailyExpense,
  deleteObligation,
  deleteObligationSchedule,
  deleteOneOffEvent,
  editDailyExpense,
  editObligation,
  editOneOffEvent,
} from './horizon-spending';

const mockedVerifySession = vi.mocked(verifySession);
const mockedGetHouseholdId = vi.mocked(getHouseholdId);
const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
});

const obligationInput = {
  accountId: 'a1',
  name: 'Rent',
  category: 'housing',
  amountMinor: 50000,
  currency: 'RSD',
  startDate: '2026-01-01',
};

describe('addObligation', () => {
  it('rejects when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    expect(await addObligation(obligationInput)).toEqual({
      ok: false,
      error: 'Not signed in.',
    });
  });

  it('rejects invalid input', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const result = await addObligation({ category: 'housing' });
    expect(result.ok).toBe(false);
  });

  it('creates the obligation on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    expect(await addObligation(obligationInput)).toEqual({ ok: true });
  });
});

describe('editObligation', () => {
  it('reports a friendly error when the obligation is not found', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const result = await editObligation('missing', { archived: true });
    expect(result).toEqual({
      ok: false,
      error: "That obligation couldn't be found.",
    });
  });
});

describe('deleteObligation', () => {
  it('rejects when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    expect(await deleteObligation('o1')).toEqual({
      ok: false,
      error: 'Not signed in.',
    });
  });

  it('reports a friendly error when nothing matched', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    expect(await deleteObligation('missing')).toEqual({
      ok: false,
      error: "That obligation couldn't be found.",
    });
  });
});

describe('addObligationSchedule / deleteObligationSchedule', () => {
  it('adds a schedule to an obligation', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    expect(
      await addObligationSchedule('o1', { kind: 'dayOfMonth', dayOfMonth: 28 })
    ).toEqual({ ok: true });
  });

  it('rejects an invalid schedule shape', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const result = await addObligationSchedule('o1', { kind: 'dayOfMonth' });
    expect(result.ok).toBe(false);
  });

  it('reports a friendly error deleting a missing schedule', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    expect(await deleteObligationSchedule('missing')).toEqual({
      ok: false,
      error: "That schedule couldn't be found.",
    });
  });
});

const dailyExpenseInput = {
  accountId: 'a1',
  name: 'Groceries',
  dailyAmountMinor: 1000,
  currency: 'RSD',
  startDate: '2026-01-01',
};

describe('addDailyExpense', () => {
  it('rejects when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    expect(await addDailyExpense(dailyExpenseInput)).toEqual({
      ok: false,
      error: 'Not signed in.',
    });
  });

  it('rejects invalid input', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const result = await addDailyExpense({ name: 'Groceries' });
    expect(result.ok).toBe(false);
  });

  it('creates the daily expense on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    expect(await addDailyExpense(dailyExpenseInput)).toEqual({ ok: true });
  });
});

describe('editDailyExpense', () => {
  it('reports a friendly error when the daily expense is not found', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const result = await editDailyExpense('missing', { archived: true });
    expect(result).toEqual({
      ok: false,
      error: "That daily expense couldn't be found.",
    });
  });
});

describe('deleteDailyExpense', () => {
  it('reports a friendly error when nothing matched', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    expect(await deleteDailyExpense('missing')).toEqual({
      ok: false,
      error: "That daily expense couldn't be found.",
    });
  });
});

const oneOffEventInput = {
  accountId: 'a1',
  name: 'Car repair',
  category: 'transport',
  amountMinor: 15000,
  currency: 'RSD',
  date: '2026-02-01',
  direction: 'out',
};

describe('addOneOffEvent', () => {
  it('rejects when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    expect(await addOneOffEvent(oneOffEventInput)).toEqual({
      ok: false,
      error: 'Not signed in.',
    });
  });

  it('rejects invalid input', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const result = await addOneOffEvent({ name: 'Car repair' });
    expect(result.ok).toBe(false);
  });

  it('creates the one-off event on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    expect(await addOneOffEvent(oneOffEventInput)).toEqual({ ok: true });
  });
});

describe('editOneOffEvent', () => {
  it('reports a friendly error when the event is not found', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const result = await editOneOffEvent('missing', { amountMinor: 500 });
    expect(result).toEqual({
      ok: false,
      error: "That one-off event couldn't be found.",
    });
  });
});

describe('deleteOneOffEvent', () => {
  it('reports a friendly error when nothing matched', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    expect(await deleteOneOffEvent('missing')).toEqual({
      ok: false,
      error: "That one-off event couldn't be found.",
    });
  });
});
