/**
 * Household-level ledger settings mutation — currently just the reporting
 * currency. Changing it never rewrites any stored `current_balance_minor` or
 * `currency` on an account (D15) — it only changes what unit totals convert
 * into at read time.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { LedgerSettings } from '../types';
import { toLedgerSettings } from '../mappers';
import type { LedgerSettingsUpdateInput } from '../validation';

export async function updateLedgerReportingCurrency(
  supabase: SupabaseServerClient,
  householdId: string,
  input: LedgerSettingsUpdateInput
): Promise<LedgerSettings | null> {
  const { data, error } = await supabase
    .from('households')
    .update({ ledger_reporting_currency: input.reportingCurrency })
    .eq('id', householdId)
    .select('ledger_reporting_currency')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toLedgerSettings(data) : null;
}
