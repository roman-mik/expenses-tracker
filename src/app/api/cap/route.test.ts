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
import { GET, PUT } from './route';

const mockedVerifySession = vi.mocked(verifySession);
const mockedGetHouseholdId = vi.mocked(getHouseholdId);
const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/cap', () => {
  it('401s when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('500s (current behavior) when the caller has no household', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockRejectedValue(new Error('No household for user'));
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const res = await GET();
    expect(res.status).toBe(500);
  });

  // Documents an existing bug, not desired behavior: `json(null, { status: 204 })`
  // (cap/route.ts) throws — the Fetch Response spec forbids a body on a 204 —
  // so this falls into the route's own catch block and surfaces as a 500
  // instead of the intended empty 204. Left as a discovered-but-out-of-scope
  // finding for this PR; update this test if/when that's fixed.
  it('500s when no cap has been set yet (204-with-body throws)', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns the cap on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const { client, db } = fakeSupabase();
    db.seed('budget_settings', [
      {
        household_id: 'h1',
        monthly_cap: 100_000,
        nudge_enabled: true,
        nudge_pct: 80,
      },
    ]);
    mockedCreateClient.mockResolvedValue(client);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      monthlyCap: 100_000,
      nudgeEnabled: true,
      nudgePct: 80,
    });
  });
});

describe('PUT /api/cap', () => {
  it('401s when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    const res = await PUT(
      new Request('http://x', { method: 'PUT', body: '{}' })
    );
    expect(res.status).toBe(401);
  });

  it('400s on an invalid body', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const res = await PUT(
      new Request('http://x', {
        method: 'PUT',
        body: JSON.stringify({ monthlyCap: -1 }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('saves the cap on a valid body', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const res = await PUT(
      new Request('http://x', {
        method: 'PUT',
        body: JSON.stringify({ monthlyCap: 100_000 }),
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).monthlyCap).toBe(100_000);
  });
});
