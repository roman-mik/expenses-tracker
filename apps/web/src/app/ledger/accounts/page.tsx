import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { getLedgerAccounts } from '@/lib/ledger/queries/accounts';
import { AccountList } from '@/components/ledger/accounts/AccountList';
import { ReconcilePanel } from '@/components/ledger/accounts/ReconcilePanel';

export default async function LedgerAccountsPage() {
  const user = await verifySession();
  if (!user) redirect('/login');

  const householdId = await getHouseholdId(user.id);
  if (!householdId) redirect('/login');

  const supabase = await createClient();
  const accounts = await getLedgerAccounts(supabase, householdId);
  const t = await getTranslations('Ledger.accounts');

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
