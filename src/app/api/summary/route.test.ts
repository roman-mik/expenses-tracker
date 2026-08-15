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
import { GET } from './route';

const mockedVerifySession = vi.mocked(verifySession);
const mockedGetHouseholdId = vi.mocked(getHouseholdId);
const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/summary', () => {
  it('401s when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    const res = await GET(
      new NextRequest('http://x/api/summary?month=2026-08')
    );
    expect(res.status).toBe(401);
  });

  it('400s on a missing/invalid month param', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const res = await GET(new NextRequest('http://x/api/summary'));
    expect(res.status).toBe(400);
  });

  it('500s (current behavior) when the caller has no household', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockRejectedValue(new Error('No household for user'));
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const res = await GET(
      new NextRequest('http://x/api/summary?month=2026-08')
    );
    expect(res.status).toBe(500);
  });

  it('returns the summary on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const { client, db } = fakeSupabase();
    db.seed('households', [
      { id: 'h1', currency: 'RSD', timezone: 'Europe/Belgrade' },
    ]);
    db.seed('budget_settings', [
      {
        household_id: 'h1',
        monthly_cap: 100_000,
        nudge_enabled: true,
        nudge_pct: 80,
      },
    ]);
    mockedCreateClient.mockResolvedValue(client);
    const res = await GET(
      new NextRequest('http://x/api/summary?month=2026-08')
    );
    expect(res.status).toBe(200);
    expect((await res.json()).cap).toBe(100_000);
  });
});
