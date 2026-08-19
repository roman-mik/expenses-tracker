/**
 * Household-level horizon settings mutation — currently just the reporting
 * currency. Changing it never rewrites any stored `current_balance_minor` or
 * `currency` on an account (D15) — it only changes what unit totals convert
 * into at read time.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { HorizonSettings } from '../types';
import { toHorizonSettings } from '../mappers';
import type { HorizonSettingsUpdateInput } from '../validation';

export async function updateHorizonReportingCurrency(
  supabase: SupabaseServerClient,
  householdId: string,
  input: HorizonSettingsUpdateInput
): Promise<HorizonSettings | null> {
  const { data, error } = await supabase
    .from('households')
    .update({ horizon_reporting_currency: input.reportingCurrency })
    .eq('id', householdId)
    .select('horizon_reporting_currency')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toHorizonSettings(data) : null;
}
