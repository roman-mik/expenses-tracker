/**
 * Household reads: the household row (currency/timezone drive the cap math and
 * month boundaries), the member list (for attribution), and the active invite
 * code. Shared by the Home/summary paths and the Household settings screen.
 */
import { cache } from 'react';
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { Household, HouseholdMember } from '@/lib/types';
import { toHousehold, type HouseholdRow } from '@/lib/mappers';

/**
 * The household's currency + timezone. Falls back to defaults if unseeded.
 *
 * `cache()`-wrapped: within one render the household is read by the page itself
 * *and* re-read inside `getSummary` and `listExpenses` (each needs the timezone).
 * Keyed on `(supabase, householdId)` — the page passes the same client instance
 * to all three, so the three would-be round-trips collapse to a single query.
 */
export const getHousehold = cache(async function getHousehold(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<Household> {
  const { data, error } = await supabase
    .from('households')
    .select('id, currency, timezone')
    .eq('id', householdId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    return { id: householdId, currency: 'RSD', timezone: 'Europe/Belgrade' };
  }
  return toHousehold(data as HouseholdRow);
});

/**
 * Members of a household with their display names. Done as two reads because
 * there is no direct FK between `household_members` and `profiles` (both point
 * at `auth.users`), so PostgREST embedding isn't available.
 */
export async function getHouseholdMembers(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<HouseholdMember[]> {
  const { data: members, error: mErr } = await supabase
    .from('household_members')
    .select('user_id, role')
    .eq('household_id', householdId)
    .order('joined_at', { ascending: true });
  if (mErr) throw new Error(mErr.message);
  if (!members || members.length === 0) return [];

  const ids = members.map((m) => m.user_id);
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', ids);
  if (pErr) throw new Error(pErr.message);

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.display_name])
  );

  return members.map((m) => ({
    userId: m.user_id,
    displayName: nameById.get(m.user_id) ?? null,
    role: (m.role as HouseholdMember['role']) ?? 'member',
  }));
}

/** The most recent active invite code for a household, or null if none. */
export async function getActiveInviteCode(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('household_invites')
    .select('code, expires_at')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at) <= new Date()) return null;
  return data.code;
}
