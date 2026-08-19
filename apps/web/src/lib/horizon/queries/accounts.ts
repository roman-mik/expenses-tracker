/**
 * Horizon account list query, same idiom as `@/lib/queries/categories`.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { HorizonAccount } from '../types';
import { toHorizonAccount, type HorizonAccountRow } from '../mappers';

const ACCOUNT_COLUMNS =
  'id, name, currency, current_balance_minor, type, include_in_total, sort_order, archived';

export async function getHorizonAccounts(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<HorizonAccount[]> {
  const { data, error } = await supabase
    .from('horizon_accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('household_id', householdId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as HorizonAccountRow[]).map(toHorizonAccount);
}
