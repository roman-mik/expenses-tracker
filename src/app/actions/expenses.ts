'use server';

import { revalidatePath } from 'next/cache';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { expenseCreateSchema } from '@/lib/validation';
import { createExpense } from '@/lib/mutations/expenses';

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Add an expense. Server Actions are reachable by direct POST, so we verify the
 * session here regardless of any client-side gating.
 */
export async function addExpense(input: unknown): Promise<ActionResult> {
  const user = await verifySession();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const parsed = expenseCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Please check the amount.' };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await createExpense(supabase, householdId, user.id, parsed.data);
  } catch {
    return { ok: false, error: "Couldn't save that just now — try again." };
  }

  revalidatePath('/');
  return { ok: true };
}
