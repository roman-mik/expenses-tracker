import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { getHorizonAccounts } from '@/lib/horizon/queries/accounts';
import { getHorizonSettings } from '@/lib/horizon/queries/settings';
import { getHorizonFxRates } from '@/lib/horizon/queries/fx';
import { getCategories } from '@/lib/queries/categories';
import {
  getHolidays,
  getIncomeStreams,
  getWorkCalendar,
} from '@/lib/horizon/queries/income';
import {
  getDailyExpenses,
  getObligations,
  getObligationSchedules,
  getOneOffEvents,
  sumPocketExpenses,
} from '@/lib/horizon/queries/spending';
import { ObligationList } from '@/components/horizon/money-out/ObligationList';
import { DailyExpenseList } from '@/components/horizon/money-out/DailyExpenseList';
import { CapTracker } from '@/components/horizon/money-out/CapTracker';
import { OneOffEventList } from '@/components/horizon/money-out/OneOffEventList';

export default async function HorizonMoneyOutPage() {
  const user = await verifySession();
  if (!user) redirect('/login');

  const householdId = await getHouseholdId(user.id);
  if (!householdId) redirect('/login');

  const supabase = await createClient();
  const [
    obligations,
    schedules,
    accounts,
    calendar,
    holidays,
    incomeStreams,
    settings,
    rates,
    dailyExpenses,
    oneOffEvents,
    categories,
  ] = await Promise.all([
    getObligations(supabase, householdId),
    getObligationSchedules(supabase, householdId),
    getHorizonAccounts(supabase, householdId),
    getWorkCalendar(supabase, householdId),
    getHolidays(supabase, householdId),
    getIncomeStreams(supabase, householdId),
    getHorizonSettings(supabase, householdId),
    getHorizonFxRates(supabase),
    getDailyExpenses(supabase, householdId),
    getOneOffEvents(supabase, householdId),
    getCategories(supabase, householdId),
  ]);

  const month = new Date().toISOString().slice(0, 7);
  const capped = dailyExpenses.filter((d) => !d.archived && d.capMinor != null);
  const actualEntries = await Promise.all(
    capped.map(
      async (d) =>
        [
          d.id,
          await sumPocketExpenses(
            supabase,
            householdId,
            d.pocketCategoryId,
            month
          ),
        ] as const
    )
  );
  const actuals = Object.fromEntries(actualEntries);

  const t = await getTranslations('Horizon.moneyOut');

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl">{t('title')}</h1>
      <div className="mt-6 flex flex-col gap-8">
        <ObligationList
          obligations={obligations}
          schedules={schedules}
          accounts={accounts}
          calendar={{
            workingWeekdays: calendar.workingWeekdays,
            holidays: holidays.map((h) => h.date),
          }}
          incomeStreams={incomeStreams}
          reportingCurrency={settings.reportingCurrency}
          rates={rates}
        />
        <DailyExpenseList
          dailyExpenses={dailyExpenses}
          accounts={accounts}
          categories={categories}
        />
        <CapTracker
          dailyExpenses={dailyExpenses}
          month={month}
          actuals={actuals}
        />
        <OneOffEventList oneOffEvents={oneOffEvents} accounts={accounts} />
      </div>
    </div>
  );
}
