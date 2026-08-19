import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { getHorizonAccounts } from '@/lib/horizon/queries/accounts';
import { AccountList } from '@/components/horizon/accounts/AccountList';
import { ReconcilePanel } from '@/components/horizon/accounts/ReconcilePanel';

export default async function HorizonAccountsPage() {
  const user = await verifySession();
  if (!user) redirect('/login');

  const householdId = await getHouseholdId(user.id);
  if (!householdId) redirect('/login');

  const supabase = await createClient();
  const accounts = await getHorizonAccounts(supabase, householdId);
  const t = await getTranslations('Horizon.accounts');

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl">{t('title')}</h1>
      <div className="mt-6">
        <AccountList accounts={accounts} />
        <ReconcilePanel accounts={accounts} />
      </div>
    </div>
  );
}
