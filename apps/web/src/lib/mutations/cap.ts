/**
 * Budget-settings (cap) upsert, shared by `PUT /api/cap` and the `setCap`
 * Server Action. Upsert so a missing row is created rather than silently
 * updating zero rows. RLS confines it to the current user.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { BudgetSettings } from '@/lib/types';
import { toBudgetSettings, type BudgetSettingsRow } from '@/lib/mappers';
import type { CapUpdateInput } from '@/lib/validation';

export async function upsertCap(
  supabase: SupabaseServerClient,
  householdId: string,
  input: CapUpdateInput,
  now: Date = new Date()
): Promise<BudgetSettings> {
  const { monthlyCap, nudgeEnabled, nudgePct } = input;

  const { data, error } = await supabase
    .from('budget_settings')
    .upsert(
      {
        household_id: householdId,
        monthly_cap: monthlyCap,
        ...(nudgeEnabled !== undefined ? { nudge_enabled: nudgeEnabled } : {}),
        ...(nudgePct !== undefined ? { nudge_pct: nudgePct } : {}),
        updated_at: now.toISOString(),
      },
      { onConflict: 'household_id' }
    )
    .select('monthly_cap, nudge_enabled, nudge_pct')
    .single();

  if (error) throw new Error(error.message);
  return toBudgetSettings(data as BudgetSettingsRow);
}
