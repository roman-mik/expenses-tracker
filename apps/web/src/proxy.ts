import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // No Supabase configured yet (e.g. first deploy) — skip session refresh.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refreshes the auth token and keeps the session cookie fresh. getClaims()
  // verifies the JWT locally and only reaches the network when the token is
  // actually expired, unlike getUser() which always round-trips to Auth.
  // dal.ts already uses getClaims() as the real authorization boundary — the
  // proxy only needs to keep the cookie in sync with it.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    // /api/* handlers do their own auth (requireHousehold / CRON_SECRET) and
    // discard this response's cookie-setting side effect, so they're excluded.
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
