import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { listExpenses } from '@/lib/queries/expenses';
import { getCategories } from '@/lib/queries/categories';
import { getHousehold, getHouseholdMembers } from '@/lib/queries/household';
import { currentMonth } from '@/lib/kapa-math';
import { zonedDateKey, dayLabel } from '@/lib/date';
import { PageHeader } from '@/components/ui/PageHeader';
import { HistoryList, type ExpenseGroup } from '@/components/home/HistoryList';
import { CategoryFilter } from '@/components/history/CategoryFilter';
import { CategoryBreakdown } from '@/components/history/CategoryBreakdown';
import { categoryBreakdown } from '@/lib/category-breakdown';

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const user = await verifySession();
  if (!user) redirect('/login');

  const householdId = await getHouseholdId(user.id);
  if (!householdId) redirect('/login');

  const supabase = await createClient();
  const { timezone: timeZone, currency } = await getHousehold(
    supabase,
    householdId
  );

  const now = new Date();
  const month = currentMonth(now, timeZone);

  const [expenses, categories, members] = await Promise.all([
    listExpenses(supabase, householdId, { month }),
    getCategories(supabase, householdId),
    getHouseholdMembers(supabase, householdId),
  ]);

  // Whole-month breakdown, unaffected by the category filter below.
  const breakdown = categoryBreakdown(expenses, currency);
  const hasOtherCurrencies = expenses.some((e) => e.currency !== currency);

  const { category: rawCategoryId } = await searchParams;
  const activeCategoryId =
    rawCategoryId && categories.some((c) => c.id === rawCategoryId)
      ? rawCategoryId
      : null;
  const filteredExpenses = activeCategoryId
    ? expenses.filter((e) => e.categoryId === activeCategoryId)
    : expenses;

  const todayKey = zonedDateKey(now, timeZone);
  const yesterdayKey = zonedDateKey(
    new Date(now.getTime() - 24 * 60 * 60 * 1000),
    timeZone
  );

  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations('History'),
  ]);
  const dayLabels = { today: t('today'), yesterday: t('yesterday') };

  // `listExpenses` returns newest-first, so groups form in that order too.
  const groups: ExpenseGroup[] = [];
  for (const e of filteredExpenses) {
    const key = zonedDateKey(new Date(e.spentAt), timeZone);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = {
        key,
        label: dayLabel(
          key,
          todayKey,
          yesterdayKey,
          e.spentAt,
          timeZone,
          locale,
          dayLabels
        ),
        expenses: [],
        total: null,
      };
      groups.push(group);
    }
    group.expenses.push(e);
  }

  // Day total — only when the day's expenses share a single currency.
  for (const group of groups) {
    const currency = group.expenses[0].currency;
    if (group.expenses.every((e) => e.currency === currency)) {
      group.total = {
        amountMinor: group.expenses.reduce((sum, e) => sum + e.amountMinor, 0),
        currency,
      };
    }
  }

  return (
    <main className="flex-1 flex justify-center px-6 py-12">
      <div className="w-full max-w-xl flex flex-col gap-8">
        <PageHeader title={t('title')} />

        <CategoryBreakdown
          breakdown={breakdown}
          categories={categories}
          currency={currency}
          hasOtherCurrencies={hasOtherCurrencies}
        />

        <CategoryFilter
          categories={categories}
          activeCategoryId={activeCategoryId}
        />

        <HistoryList
          groups={groups}
          categories={categories}
          members={members}
          currentUserId={user.id}
        />
      </div>
    </main>
  );
}
