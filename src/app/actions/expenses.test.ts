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
import { addExpense, updateExpense, deleteExpense } from './expenses';

const mockedVerifySession = vi.mocked(verifySession);
const mockedGetHouseholdId = vi.mocked(getHouseholdId);
const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('addExpense', () => {
  it('rejects when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    expect(await addExpense({ amountMinor: 500 })).toEqual({
      ok: false,
      error: 'Not signed in.',
    });
  });

  it('rejects an invalid amount', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const result = await addExpense({ amountMinor: -5 });
    expect(result.ok).toBe(false);
  });

  it('reports a friendly error on a mutation failure', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockRejectedValue(new Error('No household for user'));
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const result = await addExpense({ amountMinor: 500 });
    expect(result).toEqual({
      ok: false,
      error: "Couldn't save that just now — try again.",
    });
  });

  it('adds the expense on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    expect(await addExpense({ amountMinor: 500 })).toEqual({ ok: true });
  });
});

const UPDATED_AT = '2026-08-01T00:00:00.000Z';

describe('updateExpense', () => {
  it('reports a friendly error when the expense is not found', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const result = await updateExpense(
      'missing',
      { amountMinor: 200 },
      UPDATED_AT
    );
    expect(result).toEqual({
      ok: false,
      error: "That expense couldn't be found.",
    });
  });

  it('reports a distinct error when someone else edited it first', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const { client, db } = fakeSupabase();
    db.seed('expenses', [
      {
        id: 'e1',
        household_id: 'h1',
        category_id: null,
        amount_minor: 100,
        currency: 'RSD',
        note: null,
        spent_at: '2026-08-01T00:00:00.000Z',
        user_id: 'u1',
        updated_at: '2026-08-02T00:00:00.000Z',
      },
    ]);
    mockedCreateClient.mockResolvedValue(client);
    const result = await updateExpense(
      'e1',
      { amountMinor: 200 },
      UPDATED_AT // stale
    );
    expect(result).toEqual({
      ok: false,
      error:
        'Someone else just changed this expense — reload to see the latest.',
    });
  });
});

describe('deleteExpense', () => {
  it('rejects when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    expect(await deleteExpense('e1', UPDATED_AT)).toEqual({
      ok: false,
      error: 'Not signed in.',
    });
  });

  it('reports a friendly error when the expense is not found', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const result = await deleteExpense('missing', UPDATED_AT);
    expect(result).toEqual({
      ok: false,
      error: "That expense couldn't be found.",
    });
  });

  it('removes the expense on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const { client, db } = fakeSupabase();
    db.seed('expenses', [
      {
        id: 'e1',
        household_id: 'h1',
        category_id: null,
        amount_minor: 100,
        currency: 'RSD',
        note: null,
        spent_at: '2026-08-01T00:00:00.000Z',
        user_id: 'u1',
        updated_at: UPDATED_AT,
      },
    ]);
    mockedCreateClient.mockResolvedValue(client);
    expect(await deleteExpense('e1', UPDATED_AT)).toEqual({ ok: true });
    expect(db.rows('expenses')).toHaveLength(0);
  });
});
