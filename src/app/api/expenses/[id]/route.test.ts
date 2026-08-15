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
import { PATCH, DELETE } from './route';

const mockedVerifySession = vi.mocked(verifySession);
const mockedGetHouseholdId = vi.mocked(getHouseholdId);
const mockedCreateClient = vi.mocked(createClient);

const params = Promise.resolve({ id: 'e1' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PATCH /api/expenses/[id]', () => {
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
      new Request('http://x', {
        method: 'PATCH',
        body: JSON.stringify({ amountMinor: -1 }),
      }),
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
        body: JSON.stringify({ amountMinor: 200 }),
      }),
      { params }
    );
    expect(res.status).toBe(404);
  });

  it('updates the expense on the happy path', async () => {
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
      },
    ]);
    mockedCreateClient.mockResolvedValue(client);
    const res = await PATCH(
      new Request('http://x', {
        method: 'PATCH',
        body: JSON.stringify({ amountMinor: 200 }),
      }),
      { params }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).amountMinor).toBe(200);
  });
});

describe('DELETE /api/expenses/[id]', () => {
  it('401s when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), {
      params,
    });
    expect(res.status).toBe(401);
  });

  it('404s when the id is not in this household', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), {
      params,
    });
    expect(res.status).toBe(404);
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
      },
    ]);
    mockedCreateClient.mockResolvedValue(client);
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), {
      params,
    });
    expect(res.status).toBe(200);
    expect(db.rows('expenses')).toHaveLength(0);
  });
});
