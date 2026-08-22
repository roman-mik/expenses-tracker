import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { getHorizonAccounts } from '@/lib/horizon/queries/accounts';
import {
  getHolidays,
  getIncomeSchedules,
  getIncomeStreams,
  getWorkCalendar,
} from '@/lib/horizon/queries/income';
import { IncomeStreamList } from '@/components/horizon/money-in/IncomeStreamList';

export default async function HorizonMoneyInPage() {
  const user = await verifySession();
  if (!user) redirect('/login');

  const householdId = await getHouseholdId(user.id);
  if (!householdId) redirect('/login');

  const supabase = await createClient();
  const [streams, schedules, calendar, holidays, accounts] = await Promise.all([
    getIncomeStreams(supabase, householdId),
    getIncomeSchedules(supabase, householdId),
    getWorkCalendar(supabase, householdId),
    getHolidays(supabase, householdId),
    getHorizonAccounts(supabase, householdId),
  ]);

  const t = await getTranslations('Horizon.moneyIn');

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl">{t('title')}</h1>
      <div className="mt-6">
        <IncomeStreamList
          streams={streams}
          schedules={schedules}
          accounts={accounts}
          calendar={{
            workingWeekdays: calendar.workingWeekdays,
            holidays: holidays.map((h) => h.date),
          }}
        />
      </div>
    </div>
  );
}
