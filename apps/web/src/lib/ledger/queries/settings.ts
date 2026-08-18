/**
 * Household-level ledger settings query — currently just the reporting
 * currency, which lives on the shared `households` row (see
 * 0014_ledger_accounts.sql).
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { LedgerSettings } from '../types';
import { toLedgerSettings } from '../mappers';

export async function getLedgerSettings(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<LedgerSettings> {
  const { data, error } = await supabase
    .from('households')
    .select('ledger_reporting_currency')
    .eq('id', householdId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { reportingCurrency: 'RSD' };
  return toLedgerSettings(data);
}
