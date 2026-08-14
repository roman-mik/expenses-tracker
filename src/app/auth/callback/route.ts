import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * OAuth / magic-link callback. Exchanges the `code` for a session cookie.
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
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=closed`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
