import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/queries/profile';
import { DisplayNameForm } from '@/components/settings/DisplayNameForm';
import { LocaleForm } from '@/components/settings/LocaleForm';
import { defaultLocale } from '@/i18n/routing';

export default async function SettingsPage() {
  const user = await verifySession();
  if (!user) redirect('/login');

  const supabase = await createClient();
  const profile = await getProfile(supabase, user.id);
  const t = await getTranslations('Settings');

  return (
    <main className="flex-1 flex justify-center px-6 py-12">
      <div className="w-full max-w-md flex flex-col gap-8">
        <PageHeader title={t('title')} />

        <DisplayNameForm initialDisplayName={profile?.displayName ?? null} />

        <LocaleForm initialLocale={profile?.locale ?? defaultLocale} />

        <form action="/auth/signout" method="post">
          <Button type="submit" variant="secondary" className="w-full py-3">
            {t('signOut')}
          </Button>
        </form>
      </div>
    </main>
  );
}
