import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { getSummary } from '@/lib/queries/summary';
import { listExpenses } from '@/lib/queries/expenses';
import { getCategories } from '@/lib/queries/categories';
import {
  getHousehold,
  getHouseholdMembers,
} from '@/lib/queries/household';
import { currentMonth } from '@/lib/kapa-math';
import { zonedDateKey } from '@/lib/date';
import { formatMoney } from '@/lib/format';
import { SpentBar } from '@/components/home/SpentBar';
import { PaceLine } from '@/components/home/PaceLine';
import { TodayList } from '@/components/home/TodayList';

export default async function Home() {
  const user = await verifySession();
  if (!user) redirect('/login');

  const householdId = await getHouseholdId(user.id);
  if (!householdId) redirect('/login');

  const supabase = await createClient();

  // Timezone drives both the current-month window and "today" grouping; it now
  // lives on the household so members share month boundaries.
  const { timezone: timeZone } = await getHousehold(supabase, householdId);

  const now = new Date();
  const month = currentMonth(now, timeZone);

  const [summary, expenses, categories, members] = await Promise.all([
    getSummary(supabase, householdId, month, now),
    listExpenses(supabase, householdId, { month }),
    getCategories(supabase, householdId),
    getHouseholdMembers(supabase, householdId),
  ]);

  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const memberMap = new Map(members.map((m) => [m.userId, m]));
  const shared = members.length > 1;
  const todayKey = zonedDateKey(now, timeZone);
  const todays = expenses.filter(
    (e) => zonedDateKey(new Date(e.spentAt), timeZone) === todayKey
  );

  return (
    <main className="flex-1 flex justify-center px-6 py-12">
      <div className="w-full max-w-xl flex flex-col gap-8">
        <header className="flex items-center justify-between">
          <span className="font-heading text-2xl">Kapa</span>
          <nav className="flex items-center gap-4 text-sm text-ink/60">
            <Link
              href="/household"
              className="hover:text-ink underline-offset-4 hover:underline"
            >
              Household
            </Link>
            <Link
              href="/cap"
              className="hover:text-ink underline-offset-4 hover:underline"
            >
              Set cap
            </Link>
          </nav>
        </header>

        <section className="rounded-lg bg-surface shadow-md p-7 flex flex-col gap-5">
          <span className="text-xs font-semibold tracking-wider uppercase text-ink/50">
            Left to spend
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-5xl">
              {formatMoney(summary.remaining, summary.currency)}
            </span>
            <span className="font-semibold text-ink/55">{summary.currency}</span>
          </div>

          <SpentBar
            spent={summary.spent}
            cap={summary.cap}
            spentPct={summary.spentPct}
            currency={summary.currency}
          />

          <div className="flex gap-6 text-sm">
            <span className="text-ink/70">
              <strong className="text-ink">{summary.daysLeft}</strong> days until
              reset
            </span>
            <span className="text-ink/70">
              <strong className="text-ink">
                {formatMoney(Math.round(summary.safeDaily), summary.currency)}
              </strong>{' '}
              safe a day
            </span>
          </div>

          <PaceLine paceGap={summary.paceGap} currency={summary.currency} />
        </section>

        <Link
          href="/add"
          className="rounded-lg bg-accent text-white text-center font-semibold py-4 shadow-md hover:bg-accent-600 transition-colors"
        >
          + Add expense
        </Link>

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-wider uppercase text-ink/50">
            Today
          </h2>
          <TodayList
            expenses={todays}
            categoryMap={categoryMap}
            memberMap={shared ? memberMap : undefined}
            currentUserId={user.id}
          />
        </section>
      </div>
    </main>
  );
}
