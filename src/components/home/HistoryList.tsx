'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { deleteExpense } from '@/app/actions/expenses';
import { formatMoney } from '@/lib/format';
import { attributionLabel } from '@/lib/attribution';
import type { Category, Currency, Expense, HouseholdMember } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { PencilIcon, TrashIcon } from '@/components/ui/icons';

/** A day's worth of expenses, pre-grouped and labelled on the server. */
export interface ExpenseGroup {
  key: string;
  label: string;
  expenses: Expense[];
  /** Day total — null when the day mixes currencies (can't be summed). */
  total: { amountMinor: number; currency: Currency } | null;
}

export function HistoryList({
  groups,
  categories,
  members,
  currentUserId,
}: {
  groups: ExpenseGroup[];
  categories: Category[];
  members: HouseholdMember[];
  currentUserId: string;
}) {
  const t = useTranslations('HistoryList');
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const memberMap = new Map(members.map((m) => [m.userId, m]));
  const shared = members.length > 1;

  if (groups.length === 0) {
    return <p className="text-sm text-ink/45">{t('nothingLoggedThisMonth')}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between text-xs font-semibold tracking-wider uppercase text-ink/50">
            <h2>{group.label}</h2>
            {group.total ? (
              <span className="tabular-nums">
                {formatMoney(group.total.amountMinor, group.total.currency)}
              </span>
            ) : null}
          </div>
          <ul className="flex flex-col divide-y divide-sand-300/60">
            {group.expenses.map((e) => (
              <ExpenseRow
                key={e.id}
                expense={e}
                category={
                  e.categoryId ? categoryMap.get(e.categoryId) : undefined
                }
                who={
                  shared
                    ? attributionLabel(
                        e.addedBy,
                        currentUserId,
                        memberMap.get(e.addedBy)
                      )
                    : null
                }
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ExpenseRow({
  expense: e,
  category,
  who,
}: {
  expense: Expense;
  category: Category | undefined;
  who: string | null;
}) {
  const t = useTranslations('HistoryList');
  const tCommon = useTranslations('Common');
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const meta = [e.note, who].filter(Boolean).join(' · ');

  const remove = () => {
    startTransition(async () => {
      const result = await deleteExpense(e.id);
      if (result.ok) {
        // The action revalidated the server data; refresh to drop the row.
        toast.success(t('expenseRemoved'));
        router.refresh();
      } else {
        toast.error(result.error);
        setConfirming(false);
      }
    });
  };

  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex items-center gap-3">
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            aria-hidden
            className="size-2.5 shrink-0 self-start mt-1.5 rounded-full"
            style={{
              backgroundColor: `var(--color-${category?.color ?? 'sand-500'})`,
            }}
          />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-ink/80">
              {category?.name ?? t('uncategorized')}
            </span>
            {meta ? <span className="text-xs text-ink/45">{meta}</span> : null}
          </span>
        </span>

        <span className="shrink-0 font-medium tabular-nums">
          {formatMoney(e.amountMinor, e.currency)}
        </span>

        {confirming ? (
          <span className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded-md px-2 py-1 text-sm font-medium text-accent-700 hover:bg-surface disabled:opacity-50"
            >
              {pending ? t('removing') : t('removeConfirm')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="rounded-md px-2 py-1 text-sm text-ink/55 hover:bg-surface disabled:opacity-50"
            >
              {tCommon('cancel')}
            </button>
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-0.5">
            <Button
              href={`/edit/${e.id}`}
              variant="ghost"
              className="px-2 py-1"
              aria-label={t('editAria')}
            >
              <PencilIcon />
            </Button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={t('deleteAria')}
              className="rounded-md px-2 py-1 text-ink/55 transition-colors hover:bg-surface hover:text-accent-700"
            >
              <TrashIcon />
            </button>
          </span>
        )}
      </div>
    </li>
  );
}
