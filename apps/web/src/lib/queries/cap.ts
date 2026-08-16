/**
 * Budget-settings (cap) read, shared by `GET /api/cap` and the Set-cap screen.
 * Returns null when the user has no row yet.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { BudgetSettings } from '@/lib/types';
import { toBudgetSettings, type BudgetSettingsRow } from '@/lib/mappers';

export async function getCap(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<BudgetSettings | null> {
  const { data, error } = await supabase
    .from('budget_settings')
    .select('monthly_cap, nudge_enabled, nudge_pct')
    .eq('household_id', householdId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return toBudgetSettings(data as BudgetSettingsRow);
}
