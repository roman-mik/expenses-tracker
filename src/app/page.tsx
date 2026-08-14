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
import { Button } from '@/components/ui/Button';

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
          <nav className="flex items-center gap-3">
            <Button href="/household" variant="pill">
              Household
            </Button>
            <Button href="/cap" variant="pill">
              <GearIcon />
              Set cap
            </Button>
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

          <div className="-mt-2 -mr-2 flex justify-end">
            <Button href="/cap" variant="ghost" className="text-sm">
              Adjust cap →
            </Button>
          </div>

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

        <Button href="/add" variant="primary" className="py-4 text-center">
          + Add expense
        </Button>

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

function GearIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-ink/70"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
