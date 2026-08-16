import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { GET } from './route';

const mockedCreateClient = vi.mocked(createClient);
const mockFetch = vi.fn();

function request(secret?: string) {
  return new NextRequestLike(secret);
}

// A minimal NextRequest-compatible stand-in — only `.headers.get` is used.
class NextRequestLike {
  headers: Headers;
  constructor(secret?: string) {
    this.headers = new Headers(
      secret ? { authorization: `Bearer ${secret}` } : {}
    );
  }
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockResolvedValue({ ok: true });
  process.env.CRON_SECRET = 'test-secret';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('GET /api/keepalive', () => {
  it('401s without the correct bearer token, and never pings healthchecks', async () => {
    const res = await GET(request('wrong') as never);
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('200s and does not ping when HEALTHCHECK_URL is unset', async () => {
    delete process.env.HEALTHCHECK_URL;
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const res = await GET(request('test-secret') as never);
    expect(res.status).toBe(200);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('pings the plain healthcheck URL on success', async () => {
    process.env.HEALTHCHECK_URL = 'https://hc-ping.com/abc';
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const res = await GET(request('test-secret') as never);
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://hc-ping.com/abc',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('pings the /fail endpoint on a DB error, and still 500s', async () => {
    process.env.HEALTHCHECK_URL = 'https://hc-ping.com/abc';
    const { client, db } = fakeSupabase();
    db.failNext('households', 'connection lost');
    mockedCreateClient.mockResolvedValue(client);
    const res = await GET(request('test-secret') as never);
    expect(res.status).toBe(500);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://hc-ping.com/abc/fail',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('does not fail the route when the healthcheck ping itself fails', async () => {
    process.env.HEALTHCHECK_URL = 'https://hc-ping.com/abc';
    mockFetch.mockRejectedValue(new Error('network down'));
    mockedCreateClient.mockResolvedValue(fakeSupabase().client);
    const res = await GET(request('test-secret') as never);
    expect(res.status).toBe(200);
  });
});
