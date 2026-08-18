'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { ledgerSettingsUpdateSchema } from '@/lib/ledger/validation';
import { updateLedgerReportingCurrency } from '@/lib/ledger/mutations/settings';
import { reportError } from '@/lib/observability';
import type { ActionResult } from './expenses';

/** Set the household's ledger reporting currency. */
export async function setLedgerReportingCurrency(
  input: unknown
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = ledgerSettingsUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('checkCurrency') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await updateLedgerReportingCurrency(supabase, householdId, parsed.data);
  } catch (error) {
    reportError('setLedgerReportingCurrency', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/ledger');
  return { ok: true };
}
