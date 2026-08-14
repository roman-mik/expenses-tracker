/**
 * Builds the full home-screen summary for a user + month. Shared by
 * `GET /api/summary` (mobile-facing) and the Home Server Component, so the two
 * can never drift from the prototype's math.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { Currency, CurrencyBucket, Summary } from '@/lib/types';
import {
  daysInMonth,
  daysLeft,
  elapsedDays,
  evenPace,
  monthWindow,
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
  userId: string,
  month: string,
  now: Date = new Date()
): Promise<Summary> {
  const [{ data: profile, error: pErr }, { data: budget, error: bErr }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('currency, timezone')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('budget_settings')
        .select('monthly_cap')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);
  if (pErr) throw new Error(pErr.message);
  if (bErr) throw new Error(bErr.message);

  // Fall back to schema defaults if the user's rows aren't seeded yet.
  const currency = (profile?.currency ?? 'RSD') as Currency;
  const timeZone = profile?.timezone ?? 'Europe/Belgrade';
  const cap = Number(budget?.monthly_cap ?? 0);
  const { startUtc, endUtc } = monthWindow(month, timeZone);

  const { data: rows, error: eErr } = await supabase
    .from('expenses')
    .select('amount_minor, currency, category_id')
    .eq('user_id', userId)
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
