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
import { addCategory, editCategory, moveCategory } from './categories';

const mockedVerifySession = vi.mocked(verifySession);
const mockedGetHouseholdId = vi.mocked(getHouseholdId);
const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('addCategory', () => {
  it('rejects when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    expect(await addCategory({ name: 'Fun', color: 'accent-500' })).toEqual({
      ok: false,
      error: 'Not signed in.',
    });
  });

  it('rejects an invalid name/color', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const result = await addCategory({ name: '', color: 'not-a-color' });
    expect(result.ok).toBe(false);
  });

  it('creates the category on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    expect(await addCategory({ name: 'Fun', color: 'accent-500' })).toEqual({
      ok: true,
    });
  });
});

describe('editCategory', () => {
  it('reports a friendly error when the category is not found', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const result = await editCategory('missing', { archived: true });
    expect(result).toEqual({
      ok: false,
      error: "That category couldn't be found.",
    });
  });

  it('archives the category on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const { client, db } = fakeSupabase();
    db.seed('categories', [
      {
        id: 'c1',
        household_id: 'h1',
        name: 'Fun',
        color: 'accent-500',
        sort_order: 0,
        archived: false,
      },
    ]);
    mockedCreateClient.mockResolvedValue(client);
    expect(await editCategory('c1', { archived: true })).toEqual({ ok: true });
  });
});

describe('moveCategory', () => {
  it('rejects when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    expect(await moveCategory('c1', 'up')).toEqual({
      ok: false,
      error: 'Not signed in.',
    });
  });

  it('succeeds even at a list edge (no-op reorder is still ok:true)', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const { client, db } = fakeSupabase();
    db.seed('categories', [
      {
        id: 'c1',
        household_id: 'h1',
        name: 'Fun',
        color: 'accent-500',
        sort_order: 0,
        archived: false,
      },
    ]);
    mockedCreateClient.mockResolvedValue(client);
    expect(await moveCategory('c1', 'up')).toEqual({ ok: true });
  });
});
