import { PageHeader } from '@/components/ui/PageHeader';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { getSummary } from '@/lib/queries/summary';
import { getCategories } from '@/lib/queries/categories';
import { getExpense } from '@/lib/queries/expenses';
import { getHousehold } from '@/lib/queries/household';
import { currentMonth } from '@/lib/kapa-math';
import { AddExpenseForm } from '@/components/add/AddExpenseForm';

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await verifySession();
  if (!user) redirect('/login');

  const householdId = await getHouseholdId(user.id);
  if (!householdId) redirect('/login');

  const { id } = await params;

  const supabase = await createClient();
  const { timezone: timeZone } = await getHousehold(supabase, householdId);
  const now = new Date();

  const [summary, categories, expense] = await Promise.all([
    getSummary(supabase, householdId, currentMonth(now, timeZone), now),
    getCategories(supabase, householdId),
    getExpense(supabase, householdId, id),
  ]);

  if (!expense) notFound();

  const activeCategories = categories.filter((c) => !c.archived);
  // Treat the edit as a replacement: add this expense's amount back so the
  // form's "left after this" line reflects swapping it, not double-charging.
  const remainingIfReplaced = summary.remaining + expense.amountMinor;
  const t = await getTranslations('Add');

  return (
    <main className="flex-1 flex justify-center px-6 py-12">
      <div className="w-full max-w-md flex flex-col gap-8">
        <PageHeader title={t('titleEdit')} backHref="/history" />

        <AddExpenseForm
          categories={activeCategories}
          currency={summary.currency}
          remaining={remainingIfReplaced}
          expense={expense}
        />
      </div>
    </main>
  );
}
