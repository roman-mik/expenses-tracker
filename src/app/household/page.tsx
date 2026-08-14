import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import {
  getActiveInviteCode,
  getHouseholdMembers,
} from '@/lib/queries/household';
import { HouseholdPanel } from '@/components/household/HouseholdPanel';

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

  return (
    <main className="flex-1 flex justify-center px-6 py-12">
      <div className="w-full max-w-md flex flex-col gap-8">
        <header className="flex items-center justify-between">
          <Link href="/" className="text-sm text-ink/60 hover:text-ink">
            ← Back
          </Link>
          <span className="font-heading text-xl">Household</span>
          <span className="w-12" aria-hidden />
        </header>

        <HouseholdPanel
          members={members}
          invite={invite}
          currentUserId={user.id}
        />
      </div>
    </main>
  );
}
