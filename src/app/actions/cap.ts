'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { capUpdateSchema } from '@/lib/validation';
import { upsertCap } from '@/lib/mutations/cap';
import type { ActionResult } from './expenses';

/**
 * Set / update the monthly cap. Verifies the session itself — Server Actions
 * are directly POST-reachable.
 */
export async function setCap(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = capUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('checkCap') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await upsertCap(supabase, householdId, parsed.data);
  } catch {
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/');
  return { ok: true };
}
