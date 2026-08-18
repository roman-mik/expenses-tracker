'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import {
  ledgerAccountCreateSchema,
  ledgerAccountUpdateSchema,
} from '@/lib/ledger/validation';
import {
  createLedgerAccount,
  updateLedgerAccount,
  moveLedgerAccount as moveLedgerAccountRow,
} from '@/lib/ledger/mutations/accounts';
import { reportError } from '@/lib/observability';
import type { ActionResult } from './expenses';

/**
 * Add a ledger account. Server Actions are reachable by direct POST, so we
 * verify the session here regardless of any client-side gating.
 */
export async function addLedgerAccount(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = ledgerAccountCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('checkAccountFields') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await createLedgerAccount(supabase, householdId, parsed.data);
  } catch (error) {
    reportError('addLedgerAccount', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/ledger');
  return { ok: true };
}

/**
 * Edit a ledger account (rename, change type/currency, adjust its balance,
 * archive/restore, toggle `includeInTotal`), scoped to the caller's
 * household. A missing row is reported as a friendly error, not a crash.
 */
export async function editLedgerAccount(
  id: string,
  input: unknown
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = ledgerAccountUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('checkAccountFields') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    const updated = await updateLedgerAccount(
      supabase,
      householdId,
      id,
      parsed.data
    );
    if (!updated) return { ok: false, error: t('accountNotFound') };
  } catch (error) {
    reportError('editLedgerAccount', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/ledger');
  return { ok: true };
}

/** Swap a ledger account's position with its adjacent sibling. No-ops at either end. */
export async function moveLedgerAccount(
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
    await moveLedgerAccountRow(supabase, householdId, id, direction);
  } catch (error) {
    reportError('moveLedgerAccount', error);
    return { ok: false, error: t('reorderFailed') };
  }

  revalidatePath('/ledger');
  return { ok: true };
}
