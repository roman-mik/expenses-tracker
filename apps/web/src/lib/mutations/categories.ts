/**
 * Category create/update/reorder, shared by the `/api/categories` routes and
 * the category-management Server Actions.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { Category } from '@/lib/types';
import { toCategory, type CategoryRow } from '@/lib/mappers';
import type {
  CategoryCreateInput,
  CategoryUpdateInput,
} from '@/lib/validation';

const CATEGORY_COLUMNS = 'id, name, color, sort_order, archived';

/** New categories are appended after the current highest `sort_order`. */
export async function createCategory(
  supabase: SupabaseServerClient,
  householdId: string,
  input: CategoryCreateInput
): Promise<Category> {
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const { data: last, error: sErr } = await supabase
      .from('categories')
      .select('sort_order')
      .eq('household_id', householdId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    sortOrder = (last?.sort_order ?? -1) + 1;
  }

  const { data, error } = await supabase
    .from('categories')
    .insert({
      household_id: householdId,
      name: input.name,
      color: input.color,
      sort_order: sortOrder,
    })
    .select(CATEGORY_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return toCategory(data as CategoryRow);
}

/**
 * Edit a category, scoped to the household. Returns the updated category, or
 * `null` if no row in this household matched the id.
 */
export async function updateCategory(
  supabase: SupabaseServerClient,
  householdId: string,
  id: string,
  input: CategoryUpdateInput
): Promise<Category | null> {
  const patch: Partial<CategoryRow> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.color !== undefined) patch.color = input.color;
  if (input.archived !== undefined) patch.archived = input.archived;

  const { data, error } = await supabase
    .from('categories')
    .update(patch)
    .eq('id', id)
    .eq('household_id', householdId)
    .select(CATEGORY_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toCategory(data as CategoryRow) : null;
}

/**
 * Swap a category's `sort_order` with its adjacent sibling. A no-op at either
 * end of the list. Returns `false` if the category isn't in this household or
 * there's no sibling to swap with.
 */
export async function moveCategory(
  supabase: SupabaseServerClient,
  householdId: string,
  id: string,
  direction: 'up' | 'down'
): Promise<boolean> {
  const { data: rows, error } = await supabase
    .from('categories')
    .select('id, sort_order')
    .eq('household_id', householdId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);

  const ordered = rows ?? [];
  const index = ordered.findIndex((r) => r.id === id);
  if (index === -1) return false;

  const siblingIndex = direction === 'up' ? index - 1 : index + 1;
  if (siblingIndex < 0 || siblingIndex >= ordered.length) return false;

  const current = ordered[index];
  const sibling = ordered[siblingIndex];

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase
      .from('categories')
      .update({ sort_order: sibling.sort_order })
      .eq('id', current.id)
      .eq('household_id', householdId),
    supabase
      .from('categories')
      .update({ sort_order: current.sort_order })
      .eq('id', sibling.id)
      .eq('household_id', householdId),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);

  return true;
}
