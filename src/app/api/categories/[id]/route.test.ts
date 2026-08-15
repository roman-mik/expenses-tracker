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
import { PATCH } from './route';

const mockedVerifySession = vi.mocked(verifySession);
const mockedGetHouseholdId = vi.mocked(getHouseholdId);
const mockedCreateClient = vi.mocked(createClient);

const params = Promise.resolve({ id: 'c1' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PATCH /api/categories/[id]', () => {
  it('401s when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    const res = await PATCH(
      new Request('http://x', { method: 'PATCH', body: '{}' }),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it('401s when the caller has no household', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue(null);
    const res = await PATCH(
      new Request('http://x', { method: 'PATCH', body: '{}' }),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it('400s on an invalid body', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const res = await PATCH(
      new Request('http://x', { method: 'PATCH', body: JSON.stringify({}) }),
      { params }
    );
    expect(res.status).toBe(400);
  });

  it('404s when the id is not in this household', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const res = await PATCH(
      new Request('http://x', {
        method: 'PATCH',
        body: JSON.stringify({ archived: true }),
      }),
      { params }
    );
    expect(res.status).toBe(404);
  });

  it('updates the category on the happy path', async () => {
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
    const res = await PATCH(
      new Request('http://x', {
        method: 'PATCH',
        body: JSON.stringify({ archived: true }),
      }),
      { params }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).archived).toBe(true);
  });
});
