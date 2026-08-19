'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import {
  horizonAccountCreateSchema,
  horizonAccountUpdateSchema,
} from '@/lib/horizon/validation';
import {
  createHorizonAccount,
  updateHorizonAccount,
  moveHorizonAccount as moveHorizonAccountRow,
} from '@/lib/horizon/mutations/accounts';
import { reportError } from '@/lib/observability';
import type { ActionResult } from './expenses';

/**
 * Add a horizon account. Server Actions are reachable by direct POST, so we
 * verify the session here regardless of any client-side gating.
 */
export async function addHorizonAccount(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = horizonAccountCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('checkAccountFields') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await createHorizonAccount(supabase, householdId, parsed.data);
  } catch (error) {
    reportError('addHorizonAccount', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/horizon');
  return { ok: true };
}

/**
 * Edit a horizon account (rename, change type/currency, adjust its balance,
 * archive/restore, toggle `includeInTotal`), scoped to the caller's
 * household. A missing row is reported as a friendly error, not a crash.
 */
export async function editHorizonAccount(
  id: string,
  input: unknown
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = horizonAccountUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('checkAccountFields') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    const updated = await updateHorizonAccount(
      supabase,
      householdId,
      id,
      parsed.data
    );
    if (!updated) return { ok: false, error: t('accountNotFound') };
  } catch (error) {
    reportError('editHorizonAccount', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/horizon');
  return { ok: true };
}

/** Swap a horizon account's position with its adjacent sibling. No-ops at either end. */
export async function moveHorizonAccount(
  id: string,
  direction: 'up' | 'down'
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await moveHorizonAccountRow(supabase, householdId, id, direction);
  } catch (error) {
    reportError('moveHorizonAccount', error);
    return { ok: false, error: t('reorderFailed') };
  }

  revalidatePath('/horizon');
  return { ok: true };
}
