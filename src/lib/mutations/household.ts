/**
 * Household membership mutations: minting an invite code and redeeming one.
 * The redeem path calls the `join_household` SECURITY DEFINER RPC, which does
 * the cross-household data merge transactionally (see migrations 0003, 0008).
 */
import { randomBytes } from 'crypto';
import type { SupabaseServerClient } from '@/lib/supabase/types';

const INVITE_EXPIRY_MS = 24 * 60 * 60 * 1000;

// Crockford base32 — no I/L/O/U, so it stays readable and unambiguous read
// aloud or copied by hand. 10 chars from randomBytes(10) = 50 bits, matching
// the `household_invites_code_format` check in 0008_invite_hardening.sql.
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function generateInviteCode(): string {
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % 32]).join('');
}

/**
 * Mints a fresh invite code for a household and clears any previous ones, so a
 * household has at most one active (unredeemed) code at a time — also
 * enforced in the DB by `uq_household_invites_live`. Sets `expires_at`
 * explicitly rather than leaning on the column default, so the app's intent
 * is visible at the call site. Retries on the (now vanishingly unlikely, at
 * 50 bits) primary-key collision instead of surfacing a raw Postgres error.
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

  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS).toISOString();

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateInviteCode();
    const { error } = await supabase.from('household_invites').insert({
      code,
      household_id: householdId,
      created_by: createdBy,
      expires_at: expiresAt,
    });
    if (!error) return code;
    if (error.code !== '23505') throw new Error(error.message);
    // Primary-key collision on `code` — try again with a fresh one.
  }
  throw new Error('Could not generate a unique invite code');
}

/** Stable error codes `join_household` raises, mapped from its SQLSTATEs. */
export type JoinHouseholdError =
  | 'not-authenticated'
  | 'too-many-attempts'
  | 'has-other-members'
  | 'currency-mismatch'
  | 'invalid-code';

const SQLSTATE_TO_ERROR: Record<string, JoinHouseholdError> = {
  KAPA1: 'too-many-attempts',
  KAPA2: 'has-other-members',
  KAPA3: 'currency-mismatch',
};

/**
 * Redeems an invite code — the caller's data merges into the invite's
 * household. Returns the joined household id.
 *
 * Throws `JoinHouseholdException` (a stable code, never raw SQL text) for the
 * cases the caller can act on: an invalid/expired/already-redeemed code (the
 * RPC returns `null` for that rather than raising — see 0008's migration
 * comment for why), or one of the three known guard SQLSTATEs. Any other
 * failure (a genuine DB/network fault, or the RPC's own "Not authenticated" —
 * unreachable here since the route checks the session first) rethrows as a
 * plain `Error` so it surfaces as a 500, not a misleading 400.
 */
export async function joinHousehold(
  supabase: SupabaseServerClient,
  code: string
): Promise<string> {
  const { data, error } = await supabase.rpc('join_household', {
    invite_code: code,
  });
  if (error) {
    const mapped = error.code ? SQLSTATE_TO_ERROR[error.code] : undefined;
    if (mapped) throw new JoinHouseholdException(mapped);
    throw new Error(error.message);
  }
  if (data == null) throw new JoinHouseholdException('invalid-code');
  return data as string;
}

export class JoinHouseholdException extends Error {
  constructor(public readonly code: JoinHouseholdError) {
    super(code);
    this.name = 'JoinHouseholdException';
  }
}

/** Stable error codes `leave_household` raises, mapped from its SQLSTATE. */
export type LeaveHouseholdError = 'not-authenticated' | 'only-member';

const LEAVE_SQLSTATE_TO_ERROR: Record<string, LeaveHouseholdError> = {
  KAPA4: 'only-member',
};

/**
 * Leaves the caller's current household, forking it: a brand-new household
 * is created with a full copy of the shared history (categories, cap, every
 * expense — not just the caller's own), and the caller's membership moves
 * there. Nobody's past totals change on either side — see
 * 0012_leave_household.sql for why duplication, not a split, is the model.
 * Returns the new household id.
 */
export async function leaveHousehold(
  supabase: SupabaseServerClient
): Promise<string> {
  const { data, error } = await supabase.rpc('leave_household');
  if (error) {
    const mapped = error.code ? LEAVE_SQLSTATE_TO_ERROR[error.code] : undefined;
    if (mapped) throw new LeaveHouseholdException(mapped);
    throw new Error(error.message);
  }
  return data as string;
}

export class LeaveHouseholdException extends Error {
  constructor(public readonly code: LeaveHouseholdError) {
    super(code);
    this.name = 'LeaveHouseholdException';
  }
}
