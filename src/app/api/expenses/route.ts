import { NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { toExpense, type ExpenseRow } from "@/lib/mappers";
import { expenseCreateSchema, monthParamSchema } from "@/lib/validation";
import { badRequest, json, parseBody, unauthorized } from "@/lib/api/http";
import { monthWindow } from "@/lib/kapa-math";

export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return unauthorized();

  const monthRaw = request.nextUrl.searchParams.get("month");
  const category = request.nextUrl.searchParams.get("category");

  const supabase = await createClient();

  let query = supabase
    .from("expenses")
    .select("id, category_id, amount_minor, currency, note, spent_at")
    .eq("user_id", user.id)
    .order("spent_at", { ascending: false });

  if (monthRaw !== null) {
    const month = monthParamSchema.safeParse(monthRaw);
    if (!month.success) return badRequest(month.error.flatten());

    // Month boundaries respect the user's timezone.
    const { data: profile } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", user.id)
      .maybeSingle();
    const timezone = profile?.timezone ?? "Europe/Belgrade";
    const { startUtc, endUtc } = monthWindow(month.data, timezone);
    query = query
      .gte("spent_at", startUtc.toISOString())
      .lt("spent_at", endUtc.toISOString());
  }

  if (category) query = query.eq("category_id", category);

  const { data, error } = await query;
  if (error) return json({ error: error.message }, { status: 500 });
  return json((data as ExpenseRow[]).map(toExpense));
}

export async function POST(request: Request) {
  const user = await verifySession();
  if (!user) return unauthorized();

  const parsed = await parseBody(request, expenseCreateSchema);
  if ("response" in parsed) return parsed.response;
  const { amountMinor, categoryId, note, spentAt } = parsed.data;

  const supabase = await createClient();

  // Stamp currency from the profile — never trust the client for it.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("currency")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return json({ error: profileError.message }, { status: 500 });
  // Fall back to the default currency if the profile isn't seeded yet.
  const currency = profile?.currency ?? "RSD";

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      user_id: user.id,
      category_id: categoryId ?? null,
      amount_minor: amountMinor,
      currency,
      note: note ?? null,
      ...(spentAt ? { spent_at: spentAt } : {}),
    })
    .select("id, category_id, amount_minor, currency, note, spent_at")
    .single();

  if (error) return json({ error: error.message }, { status: 500 });
  return json(toExpense(data as ExpenseRow), { status: 201 });
}
