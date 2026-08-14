import { redirect } from 'next/navigation';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { listExpenses } from '@/lib/queries/expenses';
import { getCategories } from '@/lib/queries/categories';
import { getHousehold, getHouseholdMembers } from '@/lib/queries/household';
import { currentMonth } from '@/lib/kapa-math';
import { zonedDateKey } from '@/lib/date';
import { Button } from '@/components/ui/Button';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { HistoryList, type ExpenseGroup } from '@/components/home/HistoryList';

/** Human day label ("Today", "Yesterday", else "Mon, 12 Aug"). */
function dayLabel(
  dateKey: string,
  todayKey: string,
  yesterdayKey: string,
  spentAt: string,
  timeZone: string
): string {
  if (dateKey === todayKey) return 'Today';
  if (dateKey === yesterdayKey) return 'Yesterday';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(new Date(spentAt));
}

export default async function HistoryPage() {
  const user = await verifySession();
  if (!user) redirect('/login');

  const householdId = await getHouseholdId(user.id);
  if (!householdId) redirect('/login');

  const supabase = await createClient();
  const { timezone: timeZone } = await getHousehold(supabase, householdId);

  const now = new Date();
  const month = currentMonth(now, timeZone);

  const [expenses, categories, members] = await Promise.all([
    listExpenses(supabase, householdId, { month }),
    getCategories(supabase, householdId),
    getHouseholdMembers(supabase, householdId),
  ]);

  const todayKey = zonedDateKey(now, timeZone);
  const yesterdayKey = zonedDateKey(
    new Date(now.getTime() - 24 * 60 * 60 * 1000),
    timeZone
  );

  // `listExpenses` returns newest-first, so groups form in that order too.
  const groups: ExpenseGroup[] = [];
  for (const e of expenses) {
    const key = zonedDateKey(new Date(e.spentAt), timeZone);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = {
        key,
        label: dayLabel(key, todayKey, yesterdayKey, e.spentAt, timeZone),
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
        <header className="grid grid-cols-[1fr_auto_1fr] items-center">
          <Button href="/" variant="pill" className="justify-self-start">
            <ChevronLeftIcon />
            Back
          </Button>
          <span className="font-heading text-xl">This month</span>
          <span aria-hidden />
        </header>

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
