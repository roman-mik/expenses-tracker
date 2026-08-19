'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { requireHousehold } from '@/lib/api/http';
import { joinHouseholdSchema } from '@/lib/validation';
import {
  createInvite,
  joinHousehold as joinHouseholdRow,
  leaveHousehold as leaveHouseholdRow,
  JoinHouseholdException,
  LeaveHouseholdException,
} from '@/lib/mutations/household';
import { reportError } from '@/lib/observability';
import type { ActionResult } from './expenses';

/** Mint a fresh invite code for the caller's household. */
export async function mintInvite(): Promise<ActionResult & { code?: string }> {
  const t = await getTranslations('Household');
  const ctx = await requireHousehold();
  if ('response' in ctx) return { ok: false, error: t('couldNotCreateCode') };

  try {
    const code = await createInvite(ctx.supabase, ctx.householdId, ctx.user.id);
    revalidatePath('/household');
    return { ok: true, code };
  } catch (error) {
    reportError('mintInvite', error);
    return { ok: false, error: t('couldNotCreateCode') };
  }
}

/**
 * Redeem an invite code — the caller's data merges into that household. Does
 * NOT use requireHousehold: the caller's own household is what's about to
 * change, so only the session (not an existing household membership) is a
 * precondition.
 */
export async function joinHousehold(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Household');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('couldNotJoin') };

  const parsed = joinHouseholdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('couldNotJoin') };

  // `JoinHouseholdException.code` is a stable string ('invalid-code',
  // 'too-many-attempts', 'has-other-members', 'currency-mismatch') mapped to
  // translated copy — never raw SQL/RPC text.
  const JOIN_ERROR_KEYS = {
    'invalid-code': 'invalidCode',
    'too-many-attempts': 'tooManyAttempts',
    'has-other-members': 'hasOtherMembers',
    'currency-mismatch': 'currencyMismatch',
  } as const;

  try {
    const supabase = await createClient();
    await joinHouseholdRow(supabase, parsed.data.code);
  } catch (error) {
    if (error instanceof JoinHouseholdException) {
      const key =
        JOIN_ERROR_KEYS[error.code as keyof typeof JOIN_ERROR_KEYS] ??
        'couldNotJoin';
      return { ok: false, error: t(key) };
    }
    reportError('joinHousehold', error);
    return { ok: false, error: t('couldNotJoin') };
  }

  revalidatePath('/pocket');
  revalidatePath('/pocket/history');
  revalidatePath('/household');
  return { ok: true };
}

/**
 * Leave the caller's current household — forks it, giving the caller a new
 * solo household with a full copy of the shared history rather than
 * splitting it (see 0012_leave_household.sql). Uses requireHousehold: unlike
 * join, the caller must already be in a household to leave one.
 */
export async function leaveHousehold(): Promise<ActionResult> {
  const t = await getTranslations('Household');
  const ctx = await requireHousehold();
  if ('response' in ctx) return { ok: false, error: t('couldNotLeave') };

  try {
    await leaveHouseholdRow(ctx.supabase);
  } catch (error) {
    if (error instanceof LeaveHouseholdException) {
      // 'only-member' is the one case a caller can act on ("nothing to
      // leave"); anything else (including the RPC's own unreachable
      // "not authenticated", since requireHousehold already checked) falls
      // through to the generic message below.
      const key = error.code === 'only-member' ? 'onlyMember' : 'couldNotLeave';
      return { ok: false, error: t(key) };
    }
    reportError('leaveHousehold', error);
    return { ok: false, error: t('couldNotLeave') };
  }

  revalidatePath('/pocket');
  revalidatePath('/pocket/history');
  revalidatePath('/household');
  return { ok: true };
}
