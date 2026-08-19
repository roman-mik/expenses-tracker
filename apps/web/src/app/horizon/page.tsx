import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { getHorizonAccounts } from '@/lib/horizon/queries/accounts';
import { getHorizonSettings } from '@/lib/horizon/queries/settings';
import { getHorizonFxRates } from '@/lib/horizon/queries/fx';
import { summarizeToday, rateAgeDays } from '@/lib/horizon/today';
import { HeroBalance } from '@/components/horizon/today/HeroBalance';
import { AccountChips } from '@/components/horizon/today/AccountChips';
import { StaleRateBanner } from '@/components/horizon/today/StaleRateBanner';

export default async function HorizonTodayPage() {
  const user = await verifySession();
  if (!user) redirect('/login');

  const householdId = await getHouseholdId(user.id);
  if (!householdId) redirect('/login');

  const supabase = await createClient();
  const [accounts, settings, rates] = await Promise.all([
    getHorizonAccounts(supabase, householdId),
    getHorizonSettings(supabase, householdId),
    getHorizonFxRates(supabase),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const summary = summarizeToday(
    accounts,
    rates,
    settings.reportingCurrency,
    today
  );
  const ageDays = summary.oldestRateAsOfDate
    ? rateAgeDays(summary.oldestRateAsOfDate, today)
    : null;

  const t = await getTranslations('Horizon.rail');

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="font-heading text-2xl">{t('today')}</h1>

      {summary.isStale && ageDays !== null && (
        <StaleRateBanner ageDays={ageDays} />
      )}

      <HeroBalance
        totalMinor={summary.totalMinor}
        currency={settings.reportingCurrency}
        hasMissingRate={summary.hasMissingRate}
      />

      <AccountChips
        accounts={summary.accounts}
        reportingCurrency={settings.reportingCurrency}
      />
    </div>
  );
}
