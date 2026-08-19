/**
 * Horizon balance snapshots query.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { HorizonBalanceSnapshot } from '../types';
import {
  toHorizonBalanceSnapshot,
  type HorizonBalanceSnapshotRow,
} from '../mappers';

const SNAPSHOT_COLUMNS =
  'id, household_id, account_id, balance_minor, expected_minor, currency, recorded_at, note';

export async function getHorizonBalanceSnapshots(
  supabase: SupabaseServerClient,
  householdId: string,
  options?: { accountId?: string; limit?: number }
): Promise<HorizonBalanceSnapshot[]> {
  let query = supabase
    .from('horizon_balance_snapshots')
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
  return (data as HorizonBalanceSnapshotRow[]).map(toHorizonBalanceSnapshot);
}
