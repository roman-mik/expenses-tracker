import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { getHorizonSettings } from '@/lib/horizon/queries/settings';
import { getHorizonFxRates } from '@/lib/horizon/queries/fx';
import { ReportingCurrencyPicker } from '@/components/horizon/assumptions/ReportingCurrencyPicker';
import { FxSnapshotTable } from '@/components/horizon/assumptions/FxSnapshotTable';

export default async function HorizonAssumptionsPage() {
  const user = await verifySession();
  if (!user) redirect('/login');

  const householdId = await getHouseholdId(user.id);
  if (!householdId) redirect('/login');

  const supabase = await createClient();
  const [settings, rates] = await Promise.all([
    getHorizonSettings(supabase, householdId),
    getHorizonFxRates(supabase),
  ]);

  const t = await getTranslations('Horizon.assumptions');

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="font-heading text-2xl">{t('title')}</h1>
      <ReportingCurrencyPicker initialCurrency={settings.reportingCurrency} />
      <FxSnapshotTable rates={rates} />
    </div>
  );
}
