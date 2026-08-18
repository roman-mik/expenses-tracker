import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { getLedgerAccounts } from '@/lib/ledger/queries/accounts';
import { getLedgerSettings } from '@/lib/ledger/queries/settings';
import { getLedgerFxRates } from '@/lib/ledger/queries/fx';
import { summarizeToday, rateAgeDays } from '@/lib/ledger/today';
import { HeroBalance } from '@/components/ledger/today/HeroBalance';
import { AccountChips } from '@/components/ledger/today/AccountChips';
import { StaleRateBanner } from '@/components/ledger/today/StaleRateBanner';

export default async function LedgerTodayPage() {
  const user = await verifySession();
  if (!user) redirect('/login');

  const householdId = await getHouseholdId(user.id);
  if (!householdId) redirect('/login');

  const supabase = await createClient();
  const [accounts, settings, rates] = await Promise.all([
    getLedgerAccounts(supabase, householdId),
    getLedgerSettings(supabase, householdId),
    getLedgerFxRates(supabase),
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

  const t = await getTranslations('Ledger.rail');

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
