import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
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
import { GET, POST } from './route';

const mockedVerifySession = vi.mocked(verifySession);
const mockedGetHouseholdId = vi.mocked(getHouseholdId);
const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/expenses', () => {
  it('401s when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://x/api/expenses'));
    expect(res.status).toBe(401);
  });

  it('400s on an invalid month param', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const res = await GET(
      new NextRequest('http://x/api/expenses?month=not-a-month')
    );
    expect(res.status).toBe(400);
  });

  it('500s (current behavior) when the caller has no household', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockRejectedValue(new Error('No household for user'));
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const res = await GET(new NextRequest('http://x/api/expenses'));
    expect(res.status).toBe(500);
  });

  it('lists expenses for the household on the happy path', async () => {
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
    const res = await GET(new NextRequest('http://x/api/expenses'));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });
});

describe('POST /api/expenses', () => {
  it('401s when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    const res = await POST(
      new Request('http://x', { method: 'POST', body: '{}' })
    );
    expect(res.status).toBe(401);
  });

  it('400s on an invalid body', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({ amountMinor: -5 }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('creates the expense on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({ amountMinor: 500 }),
      })
    );
    expect(res.status).toBe(201);
    expect((await res.json()).amountMinor).toBe(500);
  });
});
