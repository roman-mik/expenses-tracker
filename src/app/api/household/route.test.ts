import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';

vi.mock('@/lib/auth/dal', () => ({
  verifySession: vi.fn(),
  getHouseholdId: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { verifySession, getHouseholdId } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { GET } from './route';

const mockedVerifySession = vi.mocked(verifySession);
const mockedGetHouseholdId = vi.mocked(getHouseholdId);
const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/household', () => {
  it('401s when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it('401s when the caller has no household', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it('returns members, invite, and self on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const { client, db } = fakeSupabase();
    db.seed('household_members', [
      {
        household_id: 'h1',
        user_id: 'u1',
        role: 'owner',
        joined_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    db.seed('profiles', [{ id: 'u1', display_name: 'Alex' }]);
    mockedCreateClient.mockResolvedValue(client);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currentUserId).toBe('u1');
    expect(body.members).toEqual([
      { userId: 'u1', displayName: 'Alex', role: 'owner' },
    ]);
    expect(body.invite).toBeNull();
  });
});
