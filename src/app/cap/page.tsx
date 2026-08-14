import Link from 'next/link';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { getSummary } from '@/lib/queries/summary';
import { getCap } from '@/lib/queries/cap';
import { currentMonth } from '@/lib/kapa-math';
import { SetCapForm } from '@/components/cap/SetCapForm';

export default async function SetCapPage() {
  const user = await verifySession();
  if (!user) redirect('/login');

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .maybeSingle();
  const timeZone = profile?.timezone ?? 'Europe/Belgrade';
  const now = new Date();

  const [summary, cap] = await Promise.all([
    getSummary(supabase, user.id, currentMonth(now, timeZone), now),
    getCap(supabase, user.id),
  ]);

  return (
    <main className="flex-1 flex justify-center px-6 py-12">
      <div className="w-full max-w-md flex flex-col gap-8">
        <header className="flex items-center justify-between">
          <Link href="/" className="text-sm text-ink/60 hover:text-ink">
            ← Back
          </Link>
          <span className="font-heading text-xl">Set cap</span>
          <span className="w-12" aria-hidden />
        </header>

        <SetCapForm
          currency={summary.currency}
          spent={summary.spent}
          daysLeft={summary.daysLeft}
          initialCap={cap?.monthlyCap ?? summary.cap}
          initialNudgeEnabled={cap?.nudgeEnabled ?? true}
          initialNudgePct={cap?.nudgePct ?? 80}
        />
      </div>
    </main>
  );
}
