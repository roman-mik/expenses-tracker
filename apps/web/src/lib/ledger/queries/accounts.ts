/**
 * Ledger account list query, same idiom as `@/lib/queries/categories`.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { LedgerAccount } from '../types';
import { toLedgerAccount, type LedgerAccountRow } from '../mappers';

const ACCOUNT_COLUMNS =
  'id, name, currency, current_balance_minor, type, include_in_total, sort_order, archived';

export async function getLedgerAccounts(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<LedgerAccount[]> {
  const { data, error } = await supabase
    .from('ledger_accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('household_id', householdId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as LedgerAccountRow[]).map(toLedgerAccount);
}
