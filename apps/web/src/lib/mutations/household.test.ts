import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import {
  createInvite,
  joinHousehold,
  JoinHouseholdException,
} from './household';

// Crockford base32, 10 chars, no I/L/O/U — matches
// household_invites_code_format in 0008_invite_hardening.sql.
const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{10}$/;

describe('createInvite', () => {
  it('replaces any previous invite for the household', async () => {
    const { client, db } = fakeSupabase();
    db.seed('household_invites', [
      { code: 'OLD1', household_id: 'h1', created_by: 'u1' },
    ]);
    const code = await createInvite(client, 'h1', 'u1');
    const rows = db.rows('household_invites');
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe(code);
    expect(code).toMatch(CODE_RE);
  });

  it('sets an explicit expires_at rather than relying on the column default', async () => {
    const { client, db } = fakeSupabase();
    await createInvite(client, 'h1', 'u1');
    const [row] = db.rows('household_invites');
    expect(typeof row.expires_at).toBe('string');
    const hoursAhead =
      (new Date(row.expires_at as string).getTime() - Date.now()) / 3_600_000;
    expect(hoursAhead).toBeGreaterThan(23);
    expect(hoursAhead).toBeLessThan(25);
  });
});

describe('joinHousehold', () => {
  it('returns the household id the RPC reports', async () => {
    const { client, db } = fakeSupabase();
    db.onRpc('join_household', (args) => {
      expect(args.invite_code).toBe('ABCD1234');
      return { data: 'target-household', error: null };
    });
    expect(await joinHousehold(client, 'ABCD1234')).toBe('target-household');
  });

  it('maps a null RPC result (invalid/expired/redeemed code) to invalid-code', async () => {
    const { client, db } = fakeSupabase();
    db.onRpc('join_household', () => ({ data: null, error: null }));
    const err = await joinHousehold(client, 'BAD').catch((e) => e);
    expect(err).toBeInstanceOf(JoinHouseholdException);
    expect((err as JoinHouseholdException).code).toBe('invalid-code');
  });

  it.each([
    ['KAPA1', 'too-many-attempts'],
    ['KAPA2', 'has-other-members'],
    ['KAPA3', 'currency-mismatch'],
  ] as const)('maps SQLSTATE %s to %s', async (sqlstate, code) => {
    const { client, db } = fakeSupabase();
    db.onRpc('join_household', () => ({
      data: null,
      error: { message: 'boom', code: sqlstate },
    }));
    const err = await joinHousehold(client, 'X').catch((e) => e);
    expect(err).toBeInstanceOf(JoinHouseholdException);
    expect((err as JoinHouseholdException).code).toBe(code);
  });

  it('rethrows an unrecognized RPC error as a plain Error, not a JoinHouseholdException', async () => {
    const { client, db } = fakeSupabase();
    db.onRpc('join_household', () => ({
      data: null,
      error: { message: 'connection reset' },
    }));
    const err = await joinHousehold(client, 'X').catch((e) => e);
    expect(err).not.toBeInstanceOf(JoinHouseholdException);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('connection reset');
  });
});
