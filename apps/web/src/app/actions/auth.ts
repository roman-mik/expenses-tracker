'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/queries/profile';
import { LOCALE_COOKIE } from '@/i18n/request';

export type SignInResult = { ok: true } | { ok: false; error: string };

/**
 * Password sign-in as a Server Action, so the browser never needs
 * @supabase/supabase-js at all — LoginForm.tsx used to pull the full client
 * SDK (auth-js + realtime + SIWE/passkey/MFA paths this app never uses) just
 * to call signInWithPassword. A Server Action can set the cookie directly via
 * the server client's cookie adapter, so this is a strict subset of what the
 * browser client did, not a workaround.
 *
 * error.message is Supabase's own English text (e.g. "Invalid login
 * credentials") — same as before this moved server-side; not translated,
 * matching every other Supabase Auth error surfaced in this app today.
 */
export async function signIn(
  email: string,
  password: string
): Promise<SignInResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return { ok: false, error: error.message };

  // Seed KAPA_LOCALE from profiles.locale so a fresh device or cleared-cookie
  // browser lands in the caller's chosen language — folded in here (was a
  // separate syncLocaleCookie() call from the client) since this is now one
  // server round trip instead of two.
  const profile = await getProfile(supabase, data.user.id);
  if (profile) {
    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE, profile.locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  }

  return { ok: true };
}
