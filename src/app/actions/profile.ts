'use server';

import { revalidatePath } from 'next/cache';
import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { displayNameSchema } from '@/lib/validation';
import { updateDisplayName } from '@/lib/mutations/profile';
import type { ActionResult } from './expenses';

/**
 * Set / clear the caller's display name (attribution across the household).
 * Server Actions are directly POST-reachable, so we verify the session here.
 */
export async function setDisplayName(input: unknown): Promise<ActionResult> {
  const user = await verifySession();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const parsed = displayNameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Please check that name.' };

  try {
    const supabase = await createClient();
    await updateDisplayName(supabase, user.id, parsed.data);
  } catch {
    return { ok: false, error: "Couldn't save that just now — try again." };
  }

  revalidatePath('/');
  revalidatePath('/household');
  revalidatePath('/settings');
  return { ok: true };
}
