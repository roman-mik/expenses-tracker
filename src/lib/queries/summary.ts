/**
 * Builds the full home-screen summary for a user + month. Shared by
 * `GET /api/summary` (mobile-facing) and the Home Server Component, so the two
 * can never drift from the prototype's math.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { Currency, CurrencyBucket, Summary } from '@/lib/types';
import { getHousehold } from '@/lib/queries/household';
import {
  daysInMonth,
  daysLeft,
  elapsedDays,
  evenPace,
  monthWindow,
  overspend,
  paceGap,
  projection,
  remaining,
  safeDaily,
  spentPct,
} from '@/lib/kapa-math';

interface SummaryRow {
  amount_minor: number;
  currency: string;
  category_id: string | null;
}

export async function getSummary(
  supabase: SupabaseServerClient,
  householdId: string,
  month: string,
  now: Date = new Date()
): Promise<Summary> {
  const [household, { data: budget, error: bErr }] = await Promise.all([
    getHousehold(supabase, householdId),
    supabase
      .from('budget_settings')
      .select('monthly_cap, nudge_enabled, nudge_pct')
      .eq('household_id', householdId)
      .maybeSingle(),
  ]);
  if (bErr) throw new Error(bErr.message);

  // Currency + timezone belong to the household; the cap is implicitly in it.
  const { currency, timezone: timeZone } = household;
  const cap = Number(budget?.monthly_cap ?? 0);
  const { startUtc, endUtc } = monthWindow(month, timeZone);

  // Whole household pool — every member's expenses count toward the shared cap.
  const { data: rows, error: eErr } = await supabase
    .from('expenses')
    .select('amount_minor, currency, category_id')
    .eq('household_id', householdId)
    .gte('spent_at', startUtc.toISOString())
    .lt('spent_at', endUtc.toISOString());
  if (eErr) throw new Error(eErr.message);

  // Split by currency. Only the active (profile) currency feeds the cap math;
  // other currencies are surfaced separately (no FX conversion in v1).
  let spent = 0;
  const breakdown = new Map<string | null, number>();
  const others = new Map<string, number>();

  for (const row of (rows ?? []) as SummaryRow[]) {
    if (row.currency === currency) {
      spent += row.amount_minor;
      breakdown.set(
        row.category_id,
        (breakdown.get(row.category_id) ?? 0) + row.amount_minor
      );
    } else {
      others.set(
        row.currency,
        (others.get(row.currency) ?? 0) + row.amount_minor
      );
    }
  }

  const D = daysInMonth(month);
  const left = daysLeft(month, now, timeZone);
  const elapsed = elapsedDays(D, left);
  const rem = remaining(cap, spent);
  const pace = evenPace(cap, elapsed, D);

  return {
    currency,
    cap,
    spent,
    remaining: rem,
    safeDaily: safeDaily(rem, left),
    daysLeft: left,
    elapsedDays: elapsed,
    evenPace: pace,
    paceGap: paceGap(pace, spent),
    projection: projection(spent, elapsed, D),
    spentPct: spentPct(spent, cap),
    overspend: overspend(cap, spent),
    nudgeEnabled: budget?.nudge_enabled ?? true,
    nudgePct: budget?.nudge_pct ?? 80,
    categoryBreakdown: [...breakdown.entries()].map(([categoryId, s]) => ({
      categoryId,
      spent: s,
    })),
    otherCurrencies: [...others.entries()].map(([c, s]): CurrencyBucket => ({
      currency: c as Currency,
      spent: s as CurrencyBucket['spent'],
    })),
  };
}
