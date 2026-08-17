import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth/dal';
import { LedgerPlaceholder } from '@/components/ledger/LedgerPlaceholder';

export default async function LedgerMoneyOutPage() {
  const user = await verifySession();
  if (!user) redirect('/login');

  return <LedgerPlaceholder screen="moneyOut" />;
}
