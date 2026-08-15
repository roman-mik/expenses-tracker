import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { getCategories } from '@/lib/queries/categories';
import { PageHeader } from '@/components/ui/PageHeader';
import { CategoryManager } from '@/components/categories/CategoryManager';

export default async function CategoriesPage() {
  const user = await verifySession();
  if (!user) redirect('/login');

  const householdId = await getHouseholdId(user.id);
  if (!householdId) redirect('/login');

  const supabase = await createClient();
  const categories = await getCategories(supabase, householdId);
  const t = await getTranslations('Categories');

  return (
    <main className="flex-1 flex justify-center px-6 py-12">
      <div className="w-full max-w-md flex flex-col gap-8">
        <PageHeader title={t('title')} />

        <CategoryManager categories={categories} />
      </div>
    </main>
  );
}
