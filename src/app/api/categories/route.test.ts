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
import { GET, POST } from './route';

const mockedVerifySession = vi.mocked(verifySession);
const mockedGetHouseholdId = vi.mocked(getHouseholdId);
const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/categories', () => {
  it('401s when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it('401s when the caller has no household', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it('500s on a DB error resolving the household', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockRejectedValue(new Error('connection lost'));
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    expect((await GET()).status).toBe(500);
  });

  it('lists categories for the household', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const { client, db } = fakeSupabase();
    db.seed('categories', [
      {
        id: 'c1',
        household_id: 'h1',
        name: 'Groceries',
        color: 'sage-500',
        sort_order: 0,
        archived: false,
      },
    ]);
    mockedCreateClient.mockResolvedValue(client);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        id: 'c1',
        name: 'Groceries',
        color: 'sage-500',
        sortOrder: 0,
        archived: false,
      },
    ]);
  });
});

describe('POST /api/categories', () => {
  it('401s when the caller has no household', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue(null);
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({ name: 'Fun', color: 'accent-500' }),
      })
    );
    expect(res.status).toBe(401);
  });

  it('400s on an invalid body', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const res = await POST(
      new Request('http://x', { method: 'POST', body: JSON.stringify({}) })
    );
    expect(res.status).toBe(400);
  });

  it('creates a category on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({ name: 'Fun', color: 'accent-500' }),
      })
    );
    expect(res.status).toBe(201);
    expect((await res.json()).name).toBe('Fun');
  });
});
