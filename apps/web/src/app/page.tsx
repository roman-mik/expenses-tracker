import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { getHousehold } from '@/lib/queries/household';
import { getSummary } from '@/lib/queries/summary';
import { currentMonth } from '@/lib/pocket-math';
import { formatMoney } from '@/lib/format';
import { getHorizonAccounts } from '@/lib/horizon/queries/accounts';
import { getHorizonSettings } from '@/lib/horizon/queries/settings';
import { getHorizonFxRates } from '@/lib/horizon/queries/fx';
import { summarizeToday } from '@/lib/horizon/today';
import { Button } from '@/components/ui/Button';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Landing.meta');
  return { title: t('title'), description: t('description') };
}

const cardClass =
  'flex flex-col items-start gap-2 rounded-lg border border-sand-300 bg-surface p-6 text-left shadow-md transition-shadow';

/**
 * The public front door — a server component that, unlike every other route,
 * does NOT redirect to /login on a missing session. Logged out, it's a pitch
 * with a sign-in CTA; logged in, a two-card chooser with live numbers pulled
 * from each app's own summary path (same calls `app/pocket/page.tsx` and
 * `app/horizon/page.tsx` already make, so the totals can't drift).
 */
export default async function LandingPage() {
  const t = await getTranslations('Landing');
  const user = await verifySession();
  const householdId = user ? await getHouseholdId(user.id) : null;

  if (!user || !householdId) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6 py-12">
        <header className="text-center">
          <h1 className="font-heading text-4xl text-accent">Kapa</h1>
          <p className="mt-2 text-ink-muted">{t('tagline')}</p>
        </header>

        <div className="flex flex-col gap-3">
          <div className={cardClass}>
            <h2 className="font-heading text-lg">{t('pocket.name')}</h2>
            <p className="text-sm text-ink-muted">{t('pocket.pitch')}</p>
          </div>
          <div className={cardClass}>
            <h2 className="font-heading text-lg">{t('horizon.name')}</h2>
            <p className="text-sm text-ink-muted">{t('horizon.pitch')}</p>
          </div>
        </div>

        <Button href="/login" variant="primary" className="w-full">
          {t('signIn')}
        </Button>
      </main>
    );
  }

  const supabase = await createClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const household = await getHousehold(supabase, householdId);
  const month = currentMonth(now, household.timezone);

  const [summary, accounts, horizonSettings, rates] = await Promise.all([
    getSummary(supabase, householdId, month, now),
    getHorizonAccounts(supabase, householdId),
    getHorizonSettings(supabase, householdId),
    getHorizonFxRates(supabase),
  ]);

  const horizonToday = summarizeToday(
    accounts,
    rates,
    horizonSettings.reportingCurrency,
    today
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center gap-8 px-6 py-12">
      <h1 className="text-center font-heading text-4xl text-accent">Kapa</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/pocket" className={`${cardClass} hover:shadow-lg`}>
          <span className="font-heading text-lg text-ink">
            {t('pocket.name')}
          </span>
          <span className="font-heading text-3xl text-ink">
            {formatMoney(summary.remaining, summary.currency)}
          </span>
          <span className="text-sm text-ink-muted">
            {summary.currency} {t('pocket.remainingLabel')}
          </span>
        </Link>

        {/* Horizon gates on desktop (see app/horizon/layout.tsx), so below
            `lg` it renders as an inert card explaining that instead of a
            link — CSS-only, no viewport JS, same precedent as the gate
            itself and AppSwitcher's `hidden lg:` tab. */}
        <div className={`${cardClass} lg:hidden`}>
          <span className="font-heading text-lg text-ink">
            {t('horizon.name')}
          </span>
          <p className="text-sm text-ink-muted">{t('horizon.desktopOnly')}</p>
        </div>

        <Link
          href="/horizon"
          className={`${cardClass} hover:shadow-lg max-lg:hidden`}
        >
          <span className="font-heading text-lg text-ink">
            {t('horizon.name')}
          </span>
          <span className="font-heading text-3xl text-ink">
            {formatMoney(
              horizonToday.totalMinor,
              horizonSettings.reportingCurrency
            )}
          </span>
          <span className="text-sm text-ink-muted">
            {horizonSettings.reportingCurrency} {t('horizon.totalLabel')}
          </span>
        </Link>
      </div>
    </main>
  );
}
