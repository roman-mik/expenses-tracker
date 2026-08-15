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
import { setCap } from './cap';

const mockedVerifySession = vi.mocked(verifySession);
const mockedGetHouseholdId = vi.mocked(getHouseholdId);
const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setCap', () => {
  it('rejects when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    const result = await setCap({ monthlyCap: 100_000 });
    expect(result).toEqual({ ok: false, error: 'Not signed in.' });
  });

  it('rejects an invalid cap', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const result = await setCap({ monthlyCap: -1 });
    expect(result.ok).toBe(false);
  });

  it('reports a friendly error when there is no household', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockRejectedValue(new Error('No household for user'));
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const result = await setCap({ monthlyCap: 100_000 });
    expect(result.ok).toBe(false);
  });

  it('saves the cap on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const { client, db } = fakeSupabase();
    mockedCreateClient.mockResolvedValue(client);
    const result = await setCap({ monthlyCap: 100_000 });
    expect(result).toEqual({ ok: true });
    expect(db.rows('budget_settings')[0]).toMatchObject({
      monthly_cap: 100_000,
    });
  });
});
