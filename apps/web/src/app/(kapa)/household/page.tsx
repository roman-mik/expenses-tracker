import { PageHeader } from '@/components/ui/PageHeader';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import {
  getActiveInviteCode,
  getHouseholdMembers,
} from '@/lib/queries/household';
import { HouseholdPanel } from '@/components/kapa/household/HouseholdPanel';

export default async function HouseholdPage() {
  const user = await verifySession();
  if (!user) redirect('/login');

  const householdId = await getHouseholdId(user.id);
  if (!householdId) redirect('/login');

  const supabase = await createClient();
  const [members, invite] = await Promise.all([
    getHouseholdMembers(supabase, householdId),
    getActiveInviteCode(supabase, householdId),
  ]);

  const t = await getTranslations('Household');

  return (
    <main className="flex-1 flex justify-center px-6 py-12">
      <div className="w-full max-w-md flex flex-col gap-8">
        <PageHeader title={t('title')} />

        <HouseholdPanel
          members={members}
          invite={invite}
          currentUserId={user.id}
        />
      </div>
    </main>
  );
}
