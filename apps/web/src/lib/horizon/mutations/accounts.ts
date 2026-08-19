/**
 * Horizon account create/update/reorder, same idiom as
 * `@/lib/mutations/categories` — `moveCategory`'s sibling-swap is the model
 * for account reordering.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { HorizonAccount } from '../types';
import { toHorizonAccount, type HorizonAccountRow } from '../mappers';
import type {
  HorizonAccountCreateInput,
  HorizonAccountUpdateInput,
} from '../validation';

const ACCOUNT_COLUMNS =
  'id, name, currency, current_balance_minor, type, include_in_total, sort_order, archived';

/** New accounts are appended after the current highest `sort_order`. */
export async function createHorizonAccount(
  supabase: SupabaseServerClient,
  householdId: string,
  input: HorizonAccountCreateInput
): Promise<HorizonAccount> {
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const { data: last, error: sErr } = await supabase
      .from('horizon_accounts')
      .select('sort_order')
      .eq('household_id', householdId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    sortOrder = (last?.sort_order ?? -1) + 1;
  }

  const { data, error } = await supabase
    .from('horizon_accounts')
    .insert({
      household_id: householdId,
      name: input.name,
      currency: input.currency,
      type: input.type,
      current_balance_minor: input.currentBalanceMinor ?? 0,
      include_in_total: input.includeInTotal ?? true,
      sort_order: sortOrder,
    })
    .select(ACCOUNT_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return toHorizonAccount(data as HorizonAccountRow);
}

/**
 * Edit an account, scoped to the household. Returns the updated account, or
 * `null` if no row in this household matched the id.
 */
export async function updateHorizonAccount(
  supabase: SupabaseServerClient,
  householdId: string,
  id: string,
  input: HorizonAccountUpdateInput
): Promise<HorizonAccount | null> {
  const patch: Partial<HorizonAccountRow> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.type !== undefined) patch.type = input.type;
  if (input.currentBalanceMinor !== undefined)
    patch.current_balance_minor = input.currentBalanceMinor;
  if (input.includeInTotal !== undefined)
    patch.include_in_total = input.includeInTotal;
  if (input.archived !== undefined) patch.archived = input.archived;

  const { data, error } = await supabase
    .from('horizon_accounts')
    .update(patch)
    .eq('id', id)
    .eq('household_id', householdId)
    .select(ACCOUNT_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toHorizonAccount(data as HorizonAccountRow) : null;
}

/**
 * Swap an account's `sort_order` with its adjacent sibling. A no-op at
 * either end of the list. Returns `false` if the account isn't in this
 * household or there's no sibling to swap with.
 */
export async function moveHorizonAccount(
  supabase: SupabaseServerClient,
  householdId: string,
  id: string,
  direction: 'up' | 'down'
): Promise<boolean> {
  const { data: rows, error } = await supabase
    .from('horizon_accounts')
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
      .from('horizon_accounts')
      .update({ sort_order: sibling.sort_order })
      .eq('id', current.id)
      .eq('household_id', householdId),
    supabase
      .from('horizon_accounts')
      .update({ sort_order: current.sort_order })
      .eq('id', sibling.id)
      .eq('household_id', householdId),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);

  return true;
}
