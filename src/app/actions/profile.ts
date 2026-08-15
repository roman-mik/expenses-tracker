'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { displayNameSchema } from '@/lib/validation';
import { updateDisplayName, updateLocale } from '@/lib/mutations/profile';
import { getProfile } from '@/lib/queries/profile';
import { isLocale } from '@/i18n/routing';
import { LOCALE_COOKIE } from '@/i18n/request';
import type { ActionResult } from './expenses';

/**
 * Set / clear the caller's display name (attribution across the household).
 * Server Actions are directly POST-reachable, so we verify the session here.
 */
export async function setDisplayName(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = displayNameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('checkName') };

  try {
    const supabase = await createClient();
    await updateDisplayName(supabase, user.id, parsed.data);
  } catch {
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/');
  revalidatePath('/household');
  revalidatePath('/settings');
  return { ok: true };
}

/**
 * Set the caller's UI language. Writes both the durable `profiles.locale`
 * (so a fresh device picks it up via the auth callback) and the
 * `KAPA_LOCALE` cookie `getRequestConfig` reads on every request — the
 * `revalidatePath` below isn't enough on its own since the cookie, not a
 * cache tag, is what `next-intl` keys off.
 */
export async function setLocale(locale: unknown): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  if (!isLocale(locale)) return { ok: false, error: t('checkLocale') };

  try {
    const supabase = await createClient();
    await updateLocale(supabase, user.id, locale);
  } catch {
    return { ok: false, error: t('saveFailed') };
  }

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });

  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * Seeds the `KAPA_LOCALE` cookie from `profiles.locale` right after a
 * password sign-in (`LoginForm`, which never hits the OAuth/magic-link
 * `auth/callback` route — see its comment there) — so a fresh device or
 * cleared-cookie browser still lands in the caller's chosen language.
 * Silently no-ops when signed out or no profile row exists yet.
 */
export async function syncLocaleCookie(): Promise<void> {
  const user = await verifySession();
  if (!user) return;

  const supabase = await createClient();
  const profile = await getProfile(supabase, user.id);
  if (!profile) return;

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, profile.locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
}
