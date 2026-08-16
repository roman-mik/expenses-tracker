/**
 * Profile read, shared by the Settings screen and anywhere else that needs the
 * caller's own display name (not to be confused with `getHouseholdMembers`,
 * which reads names for attribution across a whole household).
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { Profile } from '@/lib/types';
import { toProfile, type ProfileRow } from '@/lib/mappers';

export async function getProfile(
  supabase: SupabaseServerClient,
  userId: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, locale')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return toProfile(data as ProfileRow);
}
