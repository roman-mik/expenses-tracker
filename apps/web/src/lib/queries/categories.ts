/**
 * Category list query, shared by `GET /api/categories`, the Home category
 * lookup map, and the Add-expense chips.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { Category } from '@/lib/types';
import { toCategory, type CategoryRow } from '@/lib/mappers';

export async function getCategories(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, color, sort_order, archived')
    .eq('household_id', householdId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as CategoryRow[]).map(toCategory);
}
