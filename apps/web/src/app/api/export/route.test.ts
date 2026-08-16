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

describe('GET /api/export', () => {
  it('401s when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns a CSV attachment with header row when there are no expenses', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const { client } = fakeSupabase();
    mockedCreateClient.mockResolvedValue(client);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(await res.text()).toBe(
      'spent_at,amount_minor,currency,category,note,added_by'
    );
  });

  it('joins category and member names, keeping amounts as raw minor units', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const { client, db } = fakeSupabase();
    mockedCreateClient.mockResolvedValue(client);

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
    db.seed('household_members', [
      { household_id: 'h1', user_id: 'u1', role: 'owner', joined_at: 'now' },
    ]);
    db.seed('profiles', [{ id: 'u1', display_name: 'Alex', locale: 'en' }]);
    db.seed('expenses', [
      {
        id: 'e1',
        household_id: 'h1',
        category_id: 'c1',
        amount_minor: 1599,
        currency: 'RSD',
        note: 'a "quoted" snack, with a comma',
        spent_at: '2026-08-01T00:00:00.000Z',
        user_id: 'u1',
      },
    ]);

    const res = await GET();
    const body = await res.text();
    expect(body).toContain(
      '2026-08-01T00:00:00.000Z,1599,RSD,"Groceries","a ""quoted"" snack, with a comma","Alex"'
    );
  });

  it('emits an empty added_by for a former member whose account was deleted', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const { client, db } = fakeSupabase();
    mockedCreateClient.mockResolvedValue(client);

    db.seed('expenses', [
      {
        id: 'e1',
        household_id: 'h1',
        category_id: null,
        amount_minor: 500,
        currency: 'RSD',
        note: null,
        spent_at: '2026-08-01T00:00:00.000Z',
        user_id: null,
      },
    ]);

    const res = await GET();
    const body = await res.text();
    expect(body).toContain('2026-08-01T00:00:00.000Z,500,RSD,"","",""');
  });

  it('500s on a DB error', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockRejectedValue(new Error('connection lost'));
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);

    const res = await GET();
    expect(res.status).toBe(500);
  });
});
