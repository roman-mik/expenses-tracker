/**
 * Horizon balance reconciliation mutations (Story A4).
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { HorizonBalanceSnapshot } from '../types';
import {
  toHorizonBalanceSnapshot,
  type HorizonBalanceSnapshotRow,
} from '../mappers';
import type { ReconcileAccountBalanceInput } from '../validation';

const SNAPSHOT_COLUMNS =
  'id, household_id, account_id, balance_minor, expected_minor, currency, recorded_at, note';

/**
 * Reconcile balance(s) for accounts in a household:
 * - Records a historical snapshot in `horizon_balance_snapshots`.
 * - Updates `current_balance_minor` on `horizon_accounts`.
 */
export async function reconcileHorizonBalances(
  supabase: SupabaseServerClient,
  householdId: string,
  entries: ReconcileAccountBalanceInput[]
): Promise<HorizonBalanceSnapshot[]> {
  if (entries.length === 0) return [];

  const accountIds = entries.map((e) => e.accountId);
  const { data: accounts, error: accErr } = await supabase
    .from('horizon_accounts')
    .select('id, currency, current_balance_minor')
    .eq('household_id', householdId)
    .in('id', accountIds);

  if (accErr) throw new Error(accErr.message);

  const accountMap = new Map((accounts ?? []).map((a) => [a.id, a]));

  const results: HorizonBalanceSnapshot[] = [];

  for (const entry of entries) {
    const acc = accountMap.get(entry.accountId);
    if (!acc) {
      throw new Error(`Account ${entry.accountId} not found.`);
    }

    const { data: snapshotData, error: snapErr } = await supabase
      .from('horizon_balance_snapshots')
      .insert({
        household_id: householdId,
        account_id: entry.accountId,
        balance_minor: entry.balanceMinor,
        expected_minor: acc.current_balance_minor,
        currency: acc.currency,
        note: entry.note ? entry.note.trim() : null,
      })
      .select(SNAPSHOT_COLUMNS)
      .single();

    if (snapErr) throw new Error(snapErr.message);

    const { error: updateErr } = await supabase
      .from('horizon_accounts')
      .update({ current_balance_minor: entry.balanceMinor })
      .eq('id', entry.accountId)
      .eq('household_id', householdId);

    if (updateErr) throw new Error(updateErr.message);

    results.push(
      toHorizonBalanceSnapshot(snapshotData as HorizonBalanceSnapshotRow)
    );
  }

  return results;
}
