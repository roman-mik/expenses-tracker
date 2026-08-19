import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}));

import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { GET } from './route';

const mockedCreateServiceRoleClient = vi.mocked(createServiceRoleClient);
const mockFetch = vi.fn();

// A minimal NextRequest-compatible stand-in — only `.headers.get` is used.
class NextRequestLike {
  headers: Headers;
  constructor(secret?: string) {
    this.headers = new Headers(
      secret ? { authorization: `Bearer ${secret}` } : {}
    );
  }
}

function request(secret?: string) {
  return new NextRequestLike(secret);
}

function providerResponse(rates: Record<string, number>) {
  return {
    ok: true,
    json: async () => ({ result: 'success', rates }),
  };
}

const FULL_RATES = { RSD: 100, EUR: 1, USD: 1.1, RUB: 90 };

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mockFetch);
  process.env.CRON_SECRET = 'test-secret';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('GET /api/fx-refresh', () => {
  it('401s without the correct bearer token, and never calls the provider', async () => {
    const res = await GET(request('wrong') as never);
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('writes an upsert row for every ordered pair among the four currencies', async () => {
    mockFetch.mockResolvedValue(providerResponse(FULL_RATES));
    const { client, db } = fakeSupabase();
    mockedCreateServiceRoleClient.mockReturnValue(client);

    const res = await GET(request('test-secret') as never);
    expect(res.status).toBe(200);

    // 4 currencies fetched as base, once each.
    expect(mockFetch).toHaveBeenCalledTimes(4);

    const rows = db.rows('horizon_fx_rates');
    // 4 bases x 3 quotes each = 12 direct pairs, no inversion.
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.source === 'open.er-api.com')).toBe(true);
    expect(
      rows.find((r) => r.base_code === 'EUR' && r.quote_code === 'RSD')?.rate_e8
    ).toBe(10_000_000_000);
  });

  it('writes nothing at all when the provider omits a currency', async () => {
    mockFetch
      .mockResolvedValueOnce(providerResponse(FULL_RATES))
      // Second call (base RSD) is missing RUB.
      .mockResolvedValueOnce(providerResponse({ EUR: 0.01, USD: 0.011 }));
    const { client, db } = fakeSupabase();
    mockedCreateServiceRoleClient.mockReturnValue(client);

    const res = await GET(request('test-secret') as never);
    expect(res.status).toBe(500);
    expect(db.rows('horizon_fx_rates')).toHaveLength(0);
  });

  it('writes nothing at all when the provider request fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 });
    const { client, db } = fakeSupabase();
    mockedCreateServiceRoleClient.mockReturnValue(client);

    const res = await GET(request('test-secret') as never);
    expect(res.status).toBe(500);
    expect(db.rows('horizon_fx_rates')).toHaveLength(0);
  });

  it('re-running is idempotent — an upsert on the same day replaces rather than duplicates', async () => {
    mockFetch.mockResolvedValue(providerResponse(FULL_RATES));
    const { client, db } = fakeSupabase();
    mockedCreateServiceRoleClient.mockReturnValue(client);

    await GET(request('test-secret') as never);
    await GET(request('test-secret') as never);

    // fake-supabase's upsert matches on shared keys, so a second run
    // overwrites the same 12 rows rather than appending 12 more.
    expect(db.rows('horizon_fx_rates')).toHaveLength(12);
  });
});
