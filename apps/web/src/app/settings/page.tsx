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
        <PageHeader title={t('title')} backHref="/" />

        <DisplayNameForm initialDisplayName={profile?.displayName ?? null} />

        <LocaleForm initialLocale={profile?.locale ?? defaultLocale} />

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-wider uppercase text-ink-muted">
            {t('exportTitle')}
          </h2>
          <p className="text-sm text-ink-muted">{t('exportDescription')}</p>
          {/* A plain <a>, not the Button component's <Link>-based href
              variant — this needs a real browser navigation to a Route
              Handler that sets Content-Disposition: attachment, not a
              client-side RSC transition. */}
          <a
            href="/api/export"
            download
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-sand-400 px-5 font-semibold text-ink transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            {t('exportButton')}
          </a>
        </section>

        <form action="/auth/signout" method="post">
          <Button type="submit" variant="secondary" className="w-full py-3">
            {t('signOut')}
          </Button>
        </form>
      </div>
    </main>
  );
}
