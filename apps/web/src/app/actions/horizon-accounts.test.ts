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
  addHorizonAccount,
  editHorizonAccount,
  moveHorizonAccount,
} from './horizon-accounts';

const mockedVerifySession = vi.mocked(verifySession);
const mockedGetHouseholdId = vi.mocked(getHouseholdId);
const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('addHorizonAccount', () => {
  it('rejects when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    expect(
      await addHorizonAccount({
        name: 'Checking',
        currency: 'RSD',
        type: 'personal',
      })
    ).toEqual({ ok: false, error: 'Not signed in.' });
  });

  it('rejects invalid input', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const result = await addHorizonAccount({ name: '', currency: 'XYZ' });
    expect(result.ok).toBe(false);
  });

  it('creates the account on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    expect(
      await addHorizonAccount({
        name: 'Checking',
        currency: 'RSD',
        type: 'personal',
      })
    ).toEqual({ ok: true });
  });
});

describe('editHorizonAccount', () => {
  it('reports a friendly error when the account is not found', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const result = await editHorizonAccount('missing', { archived: true });
    expect(result).toEqual({
      ok: false,
      error: "That account couldn't be found.",
    });
  });

  it('archives the account on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const { client, db } = fakeSupabase();
    db.seed('horizon_accounts', [
      {
        id: 'a1',
        household_id: 'h1',
        name: 'Checking',
        currency: 'RSD',
        current_balance_minor: 0,
        type: 'personal',
        include_in_total: true,
        sort_order: 0,
        archived: false,
      },
    ]);
    mockedCreateClient.mockResolvedValue(client);
    expect(await editHorizonAccount('a1', { archived: true })).toEqual({
      ok: true,
    });
  });
});

describe('moveHorizonAccount', () => {
  it('rejects when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    expect(await moveHorizonAccount('a1', 'up')).toEqual({
      ok: false,
      error: 'Not signed in.',
    });
  });

  it('succeeds even at a list edge (no-op reorder is still ok:true)', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const { client, db } = fakeSupabase();
    db.seed('horizon_accounts', [
      {
        id: 'a1',
        household_id: 'h1',
        name: 'Checking',
        currency: 'RSD',
        current_balance_minor: 0,
        type: 'personal',
        include_in_total: true,
        sort_order: 0,
        archived: false,
      },
    ]);
    mockedCreateClient.mockResolvedValue(client);
    expect(await moveHorizonAccount('a1', 'up')).toEqual({ ok: true });
  });
});
