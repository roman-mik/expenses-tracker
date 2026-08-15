import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';

vi.mock('@/lib/auth/dal', () => ({
  verifySession: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

const mockedVerifySession = vi.mocked(verifySession);
const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/household/join', () => {
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
        body: JSON.stringify({ code: '' }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('400s when the RPC rejects the code', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const { client, db } = fakeSupabase();
    db.onRpc('join_household', () => ({
      data: null,
      error: { message: 'Invalid or expired invite code' },
    }));
    mockedCreateClient.mockResolvedValue(client);
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({ code: 'BAD' }),
      })
    );
    expect(res.status).toBe(400);
  });

  it('joins on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const { client, db } = fakeSupabase();
    db.onRpc('join_household', () => ({ data: 'target-h', error: null }));
    mockedCreateClient.mockResolvedValue(client);
    const res = await POST(
      new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({ code: 'ABCD1234' }),
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).householdId).toBe('target-h');
  });
});
