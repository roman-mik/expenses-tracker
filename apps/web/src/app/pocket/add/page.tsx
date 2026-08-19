import { PageHeader } from '@/components/ui/PageHeader';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { getSummary } from '@/lib/queries/summary';
import { getCategories } from '@/lib/queries/categories';
import { getHousehold } from '@/lib/queries/household';
import { currentMonth } from '@/lib/pocket-math';
import { AddExpenseForm } from '@/components/pocket/add/AddExpenseForm';

export default async function AddExpensePage() {
  const user = await verifySession();
  if (!user) redirect('/login');

  const householdId = await getHouseholdId(user.id);
  if (!householdId) redirect('/login');

  const supabase = await createClient();
  const { timezone: timeZone } = await getHousehold(supabase, householdId);
  const now = new Date();

  const [summary, categories] = await Promise.all([
    getSummary(supabase, householdId, currentMonth(now, timeZone), now),
    getCategories(supabase, householdId),
  ]);

  const activeCategories = categories.filter((c) => !c.archived);
  const t = await getTranslations('Add');

  return (
    <main className="flex-1 flex justify-center px-6 py-12">
      <div className="w-full max-w-md flex flex-col gap-8">
        <PageHeader title={t('titleNew')} />

        <AddExpenseForm
          categories={activeCategories}
          currency={summary.currency}
          remaining={summary.remaining}
        />
      </div>
    </main>
  );
}
