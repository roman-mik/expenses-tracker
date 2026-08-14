import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { toBudgetSettings, type BudgetSettingsRow } from '@/lib/mappers';
import { capUpdateSchema } from '@/lib/validation';
import { json, parseBody, unauthorized } from '@/lib/api/http';

export async function GET() {
  const user = await verifySession();
  if (!user) return unauthorized();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('budget_settings')
    .select('monthly_cap, nudge_enabled, nudge_pct')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return json({ error: error.message }, { status: 500 });
  // No row yet (user seeded out of order) → return schema defaults.
  const row: BudgetSettingsRow = (data as BudgetSettingsRow | null) ?? {
    monthly_cap: 0,
    nudge_enabled: true,
    nudge_pct: 80,
  };
  return json(toBudgetSettings(row));
}

export async function PUT(request: Request) {
  const user = await verifySession();
  if (!user) return unauthorized();

  const parsed = await parseBody(request, capUpdateSchema);
  if ('response' in parsed) return parsed.response;
  const { monthlyCap, nudgeEnabled, nudgePct } = parsed.data;

  const supabase = await createClient();
  // Upsert so a missing row (user seeded out of order) is created rather than
  // silently updating zero rows. RLS still confines it to the current user.
  const { data, error } = await supabase
    .from('budget_settings')
    .upsert(
      {
        user_id: user.id,
        monthly_cap: monthlyCap,
        ...(nudgeEnabled !== undefined ? { nudge_enabled: nudgeEnabled } : {}),
        ...(nudgePct !== undefined ? { nudge_pct: nudgePct } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select('monthly_cap, nudge_enabled, nudge_pct')
    .single();

  if (error) return json({ error: error.message }, { status: 500 });
  return json(toBudgetSettings(data as BudgetSettingsRow));
}
