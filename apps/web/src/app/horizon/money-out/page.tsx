import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { getHorizonAccounts } from '@/lib/horizon/queries/accounts';
import { getHorizonSettings } from '@/lib/horizon/queries/settings';
import { getHorizonFxRates } from '@/lib/horizon/queries/fx';
import {
  getHolidays,
  getIncomeStreams,
  getWorkCalendar,
} from '@/lib/horizon/queries/income';
import {
  getObligations,
  getObligationSchedules,
} from '@/lib/horizon/queries/spending';
import { ObligationList } from '@/components/horizon/money-out/ObligationList';

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
  ] = await Promise.all([
    getObligations(supabase, householdId),
    getObligationSchedules(supabase, householdId),
    getHorizonAccounts(supabase, householdId),
    getWorkCalendar(supabase, householdId),
    getHolidays(supabase, householdId),
    getIncomeStreams(supabase, householdId),
    getHorizonSettings(supabase, householdId),
    getHorizonFxRates(supabase),
  ]);

  const t = await getTranslations('Horizon.moneyOut');

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl">{t('title')}</h1>
      <div className="mt-6">
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
      </div>
    </div>
  );
}
