import { formatMoney } from '@/lib/format';
import type { Category, Expense } from '@/lib/types';

export function TodayList({
  expenses,
  categoryMap,
}: {
  expenses: Expense[];
  categoryMap: Map<string, Category>;
}) {
  if (expenses.length === 0) {
    return (
      <p className="text-sm text-ink/45">
        Nothing logged today. A quiet day is a good day.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-sand-300/60">
      {expenses.map((e) => {
        const category = e.categoryId ? categoryMap.get(e.categoryId) : null;
        return (
          <li key={e.id} className="flex items-center justify-between py-3">
            <span className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ backgroundColor: `var(--color-${category?.color ?? 'sand-500'})` }}
              />
              <span className="text-ink/80">
                {category?.name ?? 'Uncategorized'}
                {e.note ? (
                  <span className="text-ink/45"> · {e.note}</span>
                ) : null}
              </span>
            </span>
            <span className="font-medium tabular-nums">
              {formatMoney(e.amountMinor, e.currency)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
