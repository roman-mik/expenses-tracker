import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { getLedgerSettings } from '@/lib/ledger/queries/settings';
import { getLedgerFxRates } from '@/lib/ledger/queries/fx';
import { ReportingCurrencyPicker } from '@/components/ledger/assumptions/ReportingCurrencyPicker';
import { FxSnapshotTable } from '@/components/ledger/assumptions/FxSnapshotTable';

export default async function LedgerAssumptionsPage() {
  const user = await verifySession();
  if (!user) redirect('/login');

  const householdId = await getHouseholdId(user.id);
  if (!householdId) redirect('/login');

  const supabase = await createClient();
  const [settings, rates] = await Promise.all([
    getLedgerSettings(supabase, householdId),
    getLedgerFxRates(supabase),
  ]);

  const t = await getTranslations('Ledger.assumptions');

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="font-heading text-2xl">{t('title')}</h1>
      <ReportingCurrencyPicker initialCurrency={settings.reportingCurrency} />
      <FxSnapshotTable rates={rates} />
    </div>
  );
}
