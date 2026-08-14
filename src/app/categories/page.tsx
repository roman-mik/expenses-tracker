import { redirect } from 'next/navigation';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { getCategories } from '@/lib/queries/categories';
import { Button } from '@/components/ui/Button';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { CategoryManager } from '@/components/categories/CategoryManager';

export default async function CategoriesPage() {
  const user = await verifySession();
  if (!user) redirect('/login');

  const householdId = await getHouseholdId(user.id);
  if (!householdId) redirect('/login');

  const supabase = await createClient();
  const categories = await getCategories(supabase, householdId);

  return (
    <main className="flex-1 flex justify-center px-6 py-12">
      <div className="w-full max-w-md flex flex-col gap-8">
        <header className="grid grid-cols-[1fr_auto_1fr] items-center">
          <Button href="/" variant="pill" className="justify-self-start">
            <ChevronLeftIcon />
            Back
          </Button>
          <span className="font-heading text-xl">Categories</span>
          <span aria-hidden />
        </header>

        <CategoryManager categories={categories} />
      </div>
    </main>
  );
}
