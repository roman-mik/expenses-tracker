import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';

const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  // React `cache()` memoizes per call; force a fresh module (and thus a
  // fresh cache) per test so mocks from one test don't leak into the next.
  vi.resetModules();
  vi.clearAllMocks();
});

describe('verifySession', () => {
  it('returns null when getClaims errors', async () => {
    mockedCreateClient.mockResolvedValue({
      auth: {
        getClaims: vi
          .fn()
          .mockResolvedValue({ data: null, error: { message: 'bad token' } }),
      },
    } as never);
    const { verifySession } = await import('./dal');
    expect(await verifySession()).toBeNull();
  });

  it('returns the user id from claims.sub', async () => {
    mockedCreateClient.mockResolvedValue({
      auth: {
        getClaims: vi
          .fn()
          .mockResolvedValue({ data: { claims: { sub: 'u1' } }, error: null }),
      },
    } as never);
    const { verifySession } = await import('./dal');
    expect(await verifySession()).toEqual({ id: 'u1' });
  });
});

describe('getHouseholdId', () => {
  it('returns null when the user has no membership row', async () => {
    const { client } = fakeSupabase();
    mockedCreateClient.mockResolvedValue(client);
    const { getHouseholdId } = await import('./dal');
    expect(await getHouseholdId('u1')).toBeNull();
  });

  it('returns the household id when a membership row exists', async () => {
    const { client, db } = fakeSupabase();
    db.seed('household_members', [
      { household_id: 'h1', user_id: 'u1', role: 'owner' },
    ]);
    mockedCreateClient.mockResolvedValue(client);
    const { getHouseholdId } = await import('./dal');
    expect(await getHouseholdId('u1')).toBe('h1');
  });

  it('throws on a DB error', async () => {
    const { client, db } = fakeSupabase();
    db.failNext('household_members', 'connection lost');
    mockedCreateClient.mockResolvedValue(client);
    const { getHouseholdId } = await import('./dal');
    await expect(getHouseholdId('u1')).rejects.toThrow('connection lost');
  });
});
