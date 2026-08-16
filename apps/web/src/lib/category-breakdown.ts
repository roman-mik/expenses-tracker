/**
 * Month-to-date per-category totals, in the household's active currency only
 * (mirrors the split in `getSummary`'s breakdown — no FX conversion in v1).
 */
import type { Currency, Expense } from './types';

export function categoryBreakdown(
  expenses: Expense[],
  currency: Currency
): { categoryId: string | null; spent: number }[] {
  const totals = new Map<string | null, number>();
  for (const e of expenses) {
    if (e.currency !== currency) continue;
    totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + e.amountMinor);
  }
  return [...totals.entries()]
    .map(([categoryId, spent]) => ({ categoryId, spent }))
    .sort((a, b) => b.spent - a.spent);
}
