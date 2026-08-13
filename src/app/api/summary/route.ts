import { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { badRequest, json, unauthorized } from "@/lib/api/http";
import { monthParamSchema } from "@/lib/validation";
import type { Currency, CurrencyBucket, Summary } from "@/lib/types";
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
} from "@/lib/kapa-math";

interface SummaryRow {
  amount_minor: number;
  currency: string;
  category_id: string | null;
}

export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return unauthorized();

  const monthParsed = monthParamSchema.safeParse(
    request.nextUrl.searchParams.get("month"),
  );
  if (!monthParsed.success) return badRequest(monthParsed.error.flatten());
  const month = monthParsed.data;

  const supabase = await createClient();

  const [{ data: profile, error: pErr }, { data: budget, error: bErr }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("currency, timezone")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("budget_settings")
        .select("monthly_cap")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
  if (pErr) return json({ error: pErr.message }, { status: 500 });
  if (bErr) return json({ error: bErr.message }, { status: 500 });

  // Fall back to schema defaults if the user's rows aren't seeded yet.
  const currency = (profile?.currency ?? "RSD") as Currency;
  const timeZone = profile?.timezone ?? "Europe/Belgrade";
  const cap = Number(budget?.monthly_cap ?? 0);
  const { startUtc, endUtc } = monthWindow(month, timeZone);

  const { data: rows, error: eErr } = await supabase
    .from("expenses")
    .select("amount_minor, currency, category_id")
    .eq("user_id", user.id)
    .gte("spent_at", startUtc.toISOString())
    .lt("spent_at", endUtc.toISOString());
  if (eErr) return json({ error: eErr.message }, { status: 500 });

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
        (breakdown.get(row.category_id) ?? 0) + row.amount_minor,
      );
    } else {
      others.set(row.currency, (others.get(row.currency) ?? 0) + row.amount_minor);
    }
  }

  const D = daysInMonth(month);
  const left = daysLeft(month, new Date(), timeZone);
  const elapsed = elapsedDays(D, left);
  const rem = remaining(cap, spent);
  const pace = evenPace(cap, elapsed, D);

  const summary: Summary = {
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
    otherCurrencies: [...others.entries()].map(
      ([c, s]): CurrencyBucket => ({
        currency: c as Currency,
        spent: s as CurrencyBucket["spent"],
      }),
    ),
  };

  return json(summary);
}
