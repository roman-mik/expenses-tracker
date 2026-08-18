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
import { setLedgerReportingCurrency } from './ledger-settings';

const mockedVerifySession = vi.mocked(verifySession);
const mockedGetHouseholdId = vi.mocked(getHouseholdId);
const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setLedgerReportingCurrency', () => {
  it('rejects when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    expect(
      await setLedgerReportingCurrency({ reportingCurrency: 'EUR' })
    ).toEqual({ ok: false, error: 'Not signed in.' });
  });

  it('rejects an unsupported currency', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const result = await setLedgerReportingCurrency({
      reportingCurrency: 'XYZ',
    });
    expect(result.ok).toBe(false);
  });

  it('updates the currency on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const { client, db } = fakeSupabase();
    db.seed('households', [
      { id: 'h1', currency: 'RSD', ledger_reporting_currency: 'RSD' },
    ]);
    mockedCreateClient.mockResolvedValue(client);
    expect(
      await setLedgerReportingCurrency({ reportingCurrency: 'EUR' })
    ).toEqual({ ok: true });
  });
});
