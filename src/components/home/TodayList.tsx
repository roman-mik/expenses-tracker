import { getTranslations } from 'next-intl/server';
import { formatMoney } from '@/lib/format';
import { attributionLabel } from '@/lib/attribution';
import type { Category, Expense, HouseholdMember } from '@/lib/types';

export async function TodayList({
  expenses,
  categoryMap,
  memberMap,
  currentUserId,
}: {
  expenses: Expense[];
  categoryMap: Map<string, Category>;
  /** Present only in a shared household (>1 member) — enables attribution. */
  memberMap?: Map<string, HouseholdMember>;
  currentUserId: string;
}) {
  const t = await getTranslations('TodayList');
  if (expenses.length === 0) {
    return <p className="text-sm text-ink/45">{t('nothingLoggedToday')}</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-sand-300/60">
      {expenses.map((e) => {
        const category = e.categoryId ? categoryMap.get(e.categoryId) : null;
        const who = memberMap
          ? attributionLabel(e.addedBy, currentUserId, memberMap.get(e.addedBy))
          : null;
        return (
          <li key={e.id} className="flex items-center justify-between py-3">
            <span className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{
                  backgroundColor: `var(--color-${category?.color ?? 'sand-500'})`,
                }}
              />
              <span className="text-ink/80">
                {category?.name ?? t('uncategorized')}
                {e.note ? (
                  <span className="text-ink/45"> · {e.note}</span>
                ) : null}
                {who ? <span className="text-ink/45"> · {who}</span> : null}
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
