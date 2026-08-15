import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import { createInvite, joinHousehold } from './household';

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
    expect(code).toMatch(/^[0-9A-F]{8}$/);
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

  it('surfaces the RPC error message (e.g. an invalid/expired code)', async () => {
    const { client, db } = fakeSupabase();
    db.onRpc('join_household', () => ({
      data: null,
      error: { message: 'Invalid or expired invite code' },
    }));
    await expect(joinHousehold(client, 'BAD')).rejects.toThrow(
      'Invalid or expired invite code'
    );
  });
});
