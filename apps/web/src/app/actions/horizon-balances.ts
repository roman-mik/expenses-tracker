'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import {
  reconcileBalancesSchema,
  reconcileAccountBalanceSchema,
  type ReconcileBalancesInput,
} from '@/lib/horizon/validation';
import { reconcileHorizonBalances } from '@/lib/horizon/mutations/balances';
import { reportError } from '@/lib/observability';
import type { ActionResult } from './expenses';

/**
 * Server Action: Reconcile balance(s) for one or more horizon accounts.
 */
export async function reconcileHorizonBalancesAction(
  input: unknown
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  let entries;
  const multiParsed = reconcileBalancesSchema.safeParse(input);
  if (multiParsed.success) {
    entries = multiParsed.data.balances;
  } else {
    const singleParsed = reconcileAccountBalanceSchema.safeParse(input);
    if (singleParsed.success) {
      entries = [singleParsed.data];
    } else {
      return { ok: false, error: t('saveFailed') };
    }
  }

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await reconcileHorizonBalances(supabase, householdId, entries);
  } catch (error) {
    reportError('reconcileHorizonBalancesAction', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/horizon');
  revalidatePath('/horizon/accounts');
  return { ok: true };
}
