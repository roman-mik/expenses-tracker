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
import { reconcileHorizonBalancesAction } from './horizon-balances';

const mockedVerifySession = vi.mocked(verifySession);
const mockedGetHouseholdId = vi.mocked(getHouseholdId);
const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reconcileHorizonBalancesAction', () => {
  it('rejects when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    expect(
      await reconcileHorizonBalancesAction({
        balances: [
          {
            accountId: '00000000-0000-0000-0000-000000000001',
            balanceMinor: 100,
          },
        ],
      })
    ).toEqual({ ok: false, error: 'Not signed in.' });
  });

  it('rejects invalid schema input', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const result = await reconcileHorizonBalancesAction({ balances: [] });
    expect(result.ok).toBe(false);
  });

  it('reconciles balances on happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const { client, db } = fakeSupabase();
    db.seed('horizon_accounts', [
      {
        id: '00000000-0000-0000-0000-000000000001',
        household_id: 'h1',
        name: 'Checking',
        currency: 'EUR',
        current_balance_minor: 1000,
        type: 'personal',
        include_in_total: true,
        sort_order: 0,
        archived: false,
      },
    ]);
    mockedCreateClient.mockResolvedValue(client);

    const result = await reconcileHorizonBalancesAction({
      balances: [
        {
          accountId: '00000000-0000-0000-0000-000000000001',
          balanceMinor: 1500,
          note: 'Reconciled',
        },
      ],
    });

    expect(result).toEqual({ ok: true });
    const rows = db.rows('horizon_accounts');
    expect(
      rows.find((r) => r.id === '00000000-0000-0000-0000-000000000001')
        ?.current_balance_minor
    ).toBe(1500);
  });
});
