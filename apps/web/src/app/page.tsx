import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { getSummary } from '@/lib/queries/summary';
import { listExpenses } from '@/lib/queries/expenses';
import { getCategories } from '@/lib/queries/categories';
import { getHousehold, getHouseholdMembers } from '@/lib/queries/household';
import { currentMonth, recoveryCap } from '@/lib/kapa-math';
import { zonedDateKey, dailyTotals } from '@/lib/date';
import { formatMoney } from '@/lib/format';
import { SpentBar } from '@/components/home/SpentBar';
import { PaceLine } from '@/components/home/PaceLine';
import { RecoveryPlan } from '@/components/home/RecoveryPlan';
import { NudgeBanner } from '@/components/home/NudgeBanner';
import { ProjectionCard } from '@/components/home/ProjectionCard';
import { TodayList } from '@/components/home/TodayList';
import { DailySpendChart } from '@/components/home/DailySpendChart';
import { Button } from '@/components/ui/Button';
import { AppHeader } from '@/components/layout/AppHeader';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';

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
  const days = dailyTotals(expenses, month, timeZone, summary.currency);

  // Home state: no-cap-set is a distinct first-class state (cap <= 0 makes
  // every cap-relative number meaningless — % spent, pace, projection,
  // recovery). Otherwise over-cap wins over the nudge, which wins over the
  // healthy view.
  const isNoCap = summary.cap <= 0;
  const isOver = !isNoCap && summary.overspend > 0;
  const isNudge =
    !isNoCap &&
    !isOver &&
    summary.nudgeEnabled &&
    summary.spentPct >= summary.nudgePct;
  const barState = isOver ? 'over' : isNudge ? 'nudge' : 'healthy';
  // Day 1 has zero completed days, so evenPace is 0 and any spend reads as
  // "ahead of pace" — arithmetically honest but cool in tone. Suppress rather
  // than reintroduce the old off-by-one to soften it.
  const showPace = summary.completedDays >= 1;
  const t = await getTranslations('Home');

  return (
    <main className="flex-1 flex justify-center px-6 py-12">
      {/* AppHeader's "Kapa" wordmark is a <span>, and the first visible
          heading on this page is "Today" (<h2>) — this sr-only <h1> gives
          screen-reader users a page identity/document outline that matches
          every other route (PageHeader renders a real <h1>). */}
      <h1 className="sr-only">{t('pageTitle')}</h1>
      <div className="w-full max-w-xl lg:max-w-5xl lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
        <div className="flex flex-col gap-8">
          <AppHeader />

          {isNudge && (
            <NudgeBanner
              spentPct={summary.spentPct}
              remaining={summary.remaining}
              safeDaily={summary.safeDaily}
              currency={summary.currency}
            />
          )}

          <section className="rounded-lg bg-surface shadow-md p-7 flex flex-col gap-5">
            <span className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
              {isNoCap
                ? t('spentThisMonth')
                : isOver
                  ? t('overBudgetBy')
                  : t('leftToSpend')}
            </span>
            <div className="flex items-baseline gap-2">
              <span
                className={`font-heading text-5xl ${isOver ? 'text-accent-700' : ''}`}
              >
                {formatMoney(
                  isNoCap
                    ? summary.spent
                    : isOver
                      ? summary.overspend
                      : summary.remaining,
                  summary.currency
                )}
              </span>
              <span className="font-semibold text-ink-muted">
                {summary.currency}
              </span>
            </div>

            {!isNoCap && (
              <SpentBar
                spent={summary.spent}
                cap={summary.cap}
                spentPct={summary.spentPct}
                currency={summary.currency}
                state={barState}
              />
            )}

            {isNoCap ? (
              <>
                <p className="text-sm text-ink-muted">{t('noCapYet')}</p>
                <Button href="/cap" variant="primary" className="self-start">
                  {t('setYourCap')}
                </Button>
              </>
            ) : (
              <>
                <div className="-mt-2 -mr-2 flex justify-end">
                  <Button href="/cap" variant="ghost" className="text-sm">
                    {t('adjustCap')}
                  </Button>
                </div>

                <div className="flex gap-6 text-sm">
                  <span className="text-ink-muted">
                    {t.rich('daysUntilReset', {
                      count: summary.daysLeft,
                      strong: (chunks) => (
                        <strong className="text-ink">{chunks}</strong>
                      ),
                    })}
                  </span>
                  {!isOver && (
                    <span className="text-ink-muted">
                      <strong className="text-ink">
                        {formatMoney(summary.safeDaily, summary.currency)}
                      </strong>{' '}
                      {t('safeADay')}
                    </span>
                  )}
                </div>

                {isOver ? (
                  <RecoveryPlan
                    cap={summary.cap}
                    overspend={summary.overspend}
                    recoveryCap={recoveryCap(summary.cap, summary.overspend)}
                    daysLeft={summary.daysLeft}
                    currency={summary.currency}
                  />
                ) : (
                  <>
                    {showPace && (
                      <PaceLine
                        paceGap={summary.paceGap}
                        currency={summary.currency}
                      />
                    )}
                    <ProjectionCard
                      projection={summary.projection}
                      cap={summary.cap}
                      elapsedDays={summary.elapsedDays}
                      currency={summary.currency}
                    />
                  </>
                )}
              </>
            )}
          </section>

          <Button href="/add" variant="primary" className="py-4 text-center">
            {t('addExpense')}
          </Button>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
                {t('today')}
              </h2>
              <Button href="/history" variant="ghost" className="text-sm">
                {t('viewAll')}
              </Button>
            </div>
            <TodayList
              expenses={todays}
              categoryMap={categoryMap}
              memberMap={shared ? memberMap : undefined}
              currentUserId={user.id}
            />
          </section>

          <InstallPrompt />
        </div>

        <div className="hidden lg:flex lg:flex-col lg:gap-8">
          <DailySpendChart
            days={days}
            safeDaily={summary.safeDaily}
            todayKey={todayKey}
            currency={summary.currency}
          />
        </div>
      </div>
    </main>
  );
}
