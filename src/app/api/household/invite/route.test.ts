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
import { POST } from './route';

const mockedVerifySession = vi.mocked(verifySession);
const mockedGetHouseholdId = vi.mocked(getHouseholdId);
const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/household/invite', () => {
  it('401s when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
  });

  it('401s when the caller has no household', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
  });

  it('mints a code on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const res = await POST();
    expect(res.status).toBe(201);
    // Crockford base32, 10 chars, no I/L/O/U — matches
    // household_invites_code_format in 0008_invite_hardening.sql.
    expect((await res.json()).code).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
  });
});
