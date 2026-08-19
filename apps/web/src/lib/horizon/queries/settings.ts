/**
 * Household-level horizon settings query — currently just the reporting
 * currency, which lives on the shared `households` row (see
 * 0014_horizon_accounts.sql).
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { HorizonSettings } from '../types';
import { toHorizonSettings } from '../mappers';

export async function getHorizonSettings(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<HorizonSettings> {
  const { data, error } = await supabase
    .from('households')
    .select('horizon_reporting_currency')
    .eq('id', householdId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { reportingCurrency: 'RSD' };
  return toHorizonSettings(data);
}
