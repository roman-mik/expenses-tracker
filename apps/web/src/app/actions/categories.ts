'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { categoryCreateSchema, categoryUpdateSchema } from '@/lib/validation';
import {
  createCategory,
  updateCategory,
  moveCategory as moveCategoryRow,
} from '@/lib/mutations/categories';
import { reportError } from '@/lib/observability';

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Add a category. Server Actions are reachable by direct POST, so we verify
 * the session here regardless of any client-side gating.
 */
export async function addCategory(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = categoryCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('checkNameColor') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await createCategory(supabase, householdId, parsed.data);
  } catch (error) {
    reportError('addCategory', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/');
  revalidatePath('/history');
  revalidatePath('/categories');
  return { ok: true };
}

/**
 * Edit a category (rename, recolor, archive/restore), scoped to the caller's
 * household. A missing row is reported as a friendly error, not a crash.
 */
export async function editCategory(
  id: string,
  input: unknown
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = categoryUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('checkNameColor') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    const updated = await updateCategory(
      supabase,
      householdId,
      id,
      parsed.data
    );
    if (!updated) return { ok: false, error: t('categoryNotFound') };
  } catch (error) {
    reportError('editCategory', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/');
  revalidatePath('/history');
  revalidatePath('/categories');
  return { ok: true };
}

/** Swap a category's position with its adjacent sibling. No-ops at either end. */
export async function moveCategory(
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
    await moveCategoryRow(supabase, householdId, id, direction);
  } catch (error) {
    reportError('moveCategory', error);
    return { ok: false, error: t('reorderFailed') };
  }

  revalidatePath('/');
  revalidatePath('/history');
  revalidatePath('/categories');
  return { ok: true };
}
