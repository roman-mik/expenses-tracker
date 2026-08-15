import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import {
  getHousehold,
  getHouseholdMembers,
  getActiveInviteCode,
} from './household';

describe('getHousehold', () => {
  it('falls back to defaults when the household is unseeded', async () => {
    const { client } = fakeSupabase();
    expect(await getHousehold(client, 'h1')).toEqual({
      id: 'h1',
      currency: 'RSD',
      timezone: 'Europe/Belgrade',
    });
  });

  it('maps a seeded row', async () => {
    const { client, db } = fakeSupabase();
    db.seed('households', [
      { id: 'h1', currency: 'EUR', timezone: 'Europe/Paris' },
    ]);
    expect(await getHousehold(client, 'h1')).toEqual({
      id: 'h1',
      currency: 'EUR',
      timezone: 'Europe/Paris',
    });
  });
});

describe('getHouseholdMembers', () => {
  it('joins members to display names via a two-read lookup', async () => {
    const { client, db } = fakeSupabase();
    db.seed('household_members', [
      {
        household_id: 'h1',
        user_id: 'u1',
        role: 'owner',
        joined_at: '2026-01-01T00:00:00.000Z',
      },
      {
        household_id: 'h1',
        user_id: 'u2',
        role: 'member',
        joined_at: '2026-02-01T00:00:00.000Z',
      },
    ]);
    db.seed('profiles', [
      { id: 'u1', display_name: 'Alex' },
      { id: 'u2', display_name: null },
    ]);
    expect(await getHouseholdMembers(client, 'h1')).toEqual([
      { userId: 'u1', displayName: 'Alex', role: 'owner' },
      { userId: 'u2', displayName: null, role: 'member' },
    ]);
  });

  it('returns an empty array with no members (skips the profile lookup)', async () => {
    const { client } = fakeSupabase();
    expect(await getHouseholdMembers(client, 'h1')).toEqual([]);
  });
});

describe('getActiveInviteCode', () => {
  it('returns null when there is no invite', async () => {
    const { client } = fakeSupabase();
    expect(await getActiveInviteCode(client, 'h1')).toBeNull();
  });

  it('returns the most recent code', async () => {
    const { client, db } = fakeSupabase();
    db.seed('household_invites', [
      {
        household_id: 'h1',
        code: 'OLD',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: null,
      },
      {
        household_id: 'h1',
        code: 'NEW',
        created_at: '2026-02-01T00:00:00.000Z',
        expires_at: null,
      },
    ]);
    expect(await getActiveInviteCode(client, 'h1')).toBe('NEW');
  });

  it('treats an expired code as absent', async () => {
    const { client, db } = fakeSupabase();
    db.seed('household_invites', [
      {
        household_id: 'h1',
        code: 'EXPIRED',
        created_at: '2020-01-01T00:00:00.000Z',
        expires_at: '2020-02-01T00:00:00.000Z',
      },
    ]);
    expect(await getActiveInviteCode(client, 'h1')).toBeNull();
  });
});
