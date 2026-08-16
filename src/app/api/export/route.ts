/**
 * The user's only backup and the precondition for leaving or closing an
 * account (review-operability.md B3). Amounts stay in minor units — the
 * same integer the app stores — to avoid float corruption; divide by
 * 10 ** exponent (types.ts CURRENCY_EXPONENT) per currency to get the major
 * unit.
 */
import { json, requireHousehold } from '@/lib/api/http';
import { listAllExpenses } from '@/lib/queries/expenses';
import { getCategories } from '@/lib/queries/categories';
import { getHouseholdMembers } from '@/lib/queries/household';

const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;

export async function GET() {
  const ctx = await requireHousehold();
  if ('response' in ctx) return ctx.response;

  try {
    const [expenses, categories, members] = await Promise.all([
      listAllExpenses(ctx.supabase, ctx.householdId),
      getCategories(ctx.supabase, ctx.householdId),
      getHouseholdMembers(ctx.supabase, ctx.householdId),
    ]);

    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    // A null addedBy is a former member who deleted their account — the
    // expense stays in the shared pool, only attribution is anonymized (see
    // 0007_expense_attribution.sql). Emit an empty field, not "null".
    const memberName = new Map(
      members.map((m) => [m.userId, m.displayName ?? ''])
    );

    const rows = expenses.map((e) =>
      [
        e.spentAt,
        String(e.amountMinor),
        e.currency,
        esc(e.categoryId ? (categoryName.get(e.categoryId) ?? '') : ''),
        esc(e.note ?? ''),
        esc(e.addedBy ? (memberName.get(e.addedBy) ?? '') : ''),
      ].join(',')
    );
    const csv = [
      'spent_at,amount_minor,currency,category,note,added_by',
      ...rows,
    ].join('\n');

    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="kapa-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error('GET /api/export failed', error);
    return json({ error: 'Export failed' }, { status: 500 });
  }
}
