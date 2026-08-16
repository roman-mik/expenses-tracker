import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, isLocale, type Locale } from './routing';

/**
 * No `[locale]` URL segment (PLAN.md §7 Phase 7) — locale travels in a
 * cookie instead, seeded from `profiles.locale` on sign-in (see
 * `src/app/auth/callback/route.ts`) and updated by the settings action
 * (`src/app/actions/profile.ts`). This keeps `getRequestConfig` free of any
 * Supabase call on every request.
 */
export const LOCALE_COOKIE = 'KAPA_LOCALE';

async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const headerStore = await headers();
  const preferred = headerStore
    .get('accept-language')
    ?.split(',')[0]
    ?.split('-')[0]
    ?.trim();
  if (isLocale(preferred)) return preferred;

  return defaultLocale;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
