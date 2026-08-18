/**
 * Ledger balance snapshots query.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { LedgerBalanceSnapshot } from '../types';
import {
  toLedgerBalanceSnapshot,
  type LedgerBalanceSnapshotRow,
} from '../mappers';

const SNAPSHOT_COLUMNS =
  'id, household_id, account_id, balance_minor, expected_minor, currency, recorded_at, note';

export async function getLedgerBalanceSnapshots(
  supabase: SupabaseServerClient,
  householdId: string,
  options?: { accountId?: string; limit?: number }
): Promise<LedgerBalanceSnapshot[]> {
  let query = supabase
    .from('ledger_balance_snapshots')
    .select(SNAPSHOT_COLUMNS)
    .eq('household_id', householdId)
    .order('recorded_at', { ascending: false });

  if (options?.accountId) {
    query = query.eq('account_id', options.accountId);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as LedgerBalanceSnapshotRow[]).map(toLedgerBalanceSnapshot);
}
