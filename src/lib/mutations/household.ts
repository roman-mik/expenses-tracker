/**
 * Household membership mutations: minting an invite code and redeeming one.
 * The redeem path calls the `join_household` SECURITY DEFINER RPC, which does
 * the cross-household data merge transactionally (see migration 0003).
 */
import { randomBytes } from 'crypto';
import type { SupabaseServerClient } from '@/lib/supabase/types';

/** A short, human-friendly invite code (8 uppercase hex chars). */
function generateInviteCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

/**
 * Mints a fresh invite code for a household and clears any previous ones, so a
 * household has at most one active code at a time. Returns the new code.
 */
export async function createInvite(
  supabase: SupabaseServerClient,
  householdId: string,
  createdBy: string
): Promise<string> {
  // Replace older codes for this household (one active code at a time).
  const { error: delErr } = await supabase
    .from('household_invites')
    .delete()
    .eq('household_id', householdId);
  if (delErr) throw new Error(delErr.message);

  const code = generateInviteCode();
  const { error } = await supabase.from('household_invites').insert({
    code,
    household_id: householdId,
    created_by: createdBy,
  });
  if (error) throw new Error(error.message);
  return code;
}

/**
 * Redeems an invite code — the caller's data merges into the invite's
 * household. Returns the joined household id. Throws with a user-safe message
 * on an invalid/expired code.
 */
export async function joinHousehold(
  supabase: SupabaseServerClient,
  code: string
): Promise<string> {
  const { data, error } = await supabase.rpc('join_household', {
    invite_code: code,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
