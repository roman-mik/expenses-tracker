/**
 * Ledger balance reconciliation mutations (Story A4).
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { LedgerBalanceSnapshot } from '../types';
import {
  toLedgerBalanceSnapshot,
  type LedgerBalanceSnapshotRow,
} from '../mappers';
import type { ReconcileAccountBalanceInput } from '../validation';

const SNAPSHOT_COLUMNS =
  'id, household_id, account_id, balance_minor, expected_minor, currency, recorded_at, note';

/**
 * Reconcile balance(s) for accounts in a household:
 * - Records a historical snapshot in `ledger_balance_snapshots`.
 * - Updates `current_balance_minor` on `ledger_accounts`.
 */
export async function reconcileLedgerBalances(
  supabase: SupabaseServerClient,
  householdId: string,
  entries: ReconcileAccountBalanceInput[]
): Promise<LedgerBalanceSnapshot[]> {
  if (entries.length === 0) return [];

  const accountIds = entries.map((e) => e.accountId);
  const { data: accounts, error: accErr } = await supabase
    .from('ledger_accounts')
    .select('id, currency, current_balance_minor')
    .eq('household_id', householdId)
    .in('id', accountIds);

  if (accErr) throw new Error(accErr.message);

  const accountMap = new Map((accounts ?? []).map((a) => [a.id, a]));

  const results: LedgerBalanceSnapshot[] = [];

  for (const entry of entries) {
    const acc = accountMap.get(entry.accountId);
    if (!acc) {
      throw new Error(`Account ${entry.accountId} not found.`);
    }

    const { data: snapshotData, error: snapErr } = await supabase
      .from('ledger_balance_snapshots')
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
      .from('ledger_accounts')
      .update({ current_balance_minor: entry.balanceMinor })
      .eq('id', entry.accountId)
      .eq('household_id', householdId);

    if (updateErr) throw new Error(updateErr.message);

    results.push(
      toLedgerBalanceSnapshot(snapshotData as LedgerBalanceSnapshotRow)
    );
  }

  return results;
}
