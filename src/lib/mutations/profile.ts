/**
 * Display-name update, shared by the Settings screen. Update rather than
 * upsert — `handle_new_user` guarantees every user already has a profile row.
 * RLS confines this to `id = auth.uid()`.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { Profile } from '@/lib/types';
import { toProfile, type ProfileRow } from '@/lib/mappers';
import type { DisplayNameInput } from '@/lib/validation';

export async function updateDisplayName(
  supabase: SupabaseServerClient,
  userId: string,
  input: DisplayNameInput
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: input.displayName })
    .eq('id', userId)
    .select('id, display_name')
    .single();

  if (error) throw new Error(error.message);
  return toProfile(data as ProfileRow);
}
