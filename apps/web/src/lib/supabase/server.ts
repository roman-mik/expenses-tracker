import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from './database.types';

export async function createClient() {
  // No outer try/catch: `await cookies()` throws Next's DynamicServerError during
  // static prerender, and Next relies on that specific error propagating to switch
  // the route to dynamic rendering. Swallowing it forces every authed page to carry
  // `export const dynamic = 'force-dynamic'`.
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore when middleware
            // refreshes the session.
          }
        },
      },
    }
  );
}
