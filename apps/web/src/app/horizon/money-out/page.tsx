import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth/dal';
import { HorizonPlaceholder } from '@/components/horizon/HorizonPlaceholder';

export default async function HorizonMoneyOutPage() {
  const user = await verifySession();
  if (!user) redirect('/login');

  return <HorizonPlaceholder screen="moneyOut" />;
}
