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
  addObligation,
  addObligationSchedule,
  deleteObligation,
  deleteObligationSchedule,
  editObligation,
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
