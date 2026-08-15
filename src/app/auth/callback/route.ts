import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/queries/profile';
import { LOCALE_COOKIE } from '@/i18n/request';

/**
 * OAuth / magic-link callback. Exchanges the `code` for a session cookie.
 * `LoginForm` (password sign-in) never reaches this route — it seeds the
 * locale cookie itself via `syncLocaleCookie()` instead.
 *
 * This is also where "registration closed" is enforced end-to-end: when public
 * sign-ups are disabled in Supabase, a non-provisioned user's exchange fails, so
 * we bounce them back to the login screen with a friendly closed-signups state.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=closed`);
  }

  const response = NextResponse.redirect(`${origin}${next}`);

  // Seed the locale cookie from the stored preference so a fresh device (or
  // one with cookies cleared) still lands in the user's chosen language.
  const profile = await getProfile(supabase, data.user.id);
  if (profile) {
    response.cookies.set(LOCALE_COOKIE, profile.locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  }

  return response;
}
