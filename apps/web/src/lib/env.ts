import { z } from 'zod';

// Both vars are Sensitive in the Vercel dashboard (see NEXT_PUBLIC_SUPABASE_URL /
// NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY), so `vercel pull` can never read them back —
// they only ever get inlined into the bundle by a build that runs on Vercel's own
// machine. A build anywhere else (e.g. GitHub Actions) sees them empty/undefined.
// Validating eagerly here, instead of a bare `!` assertion at each call site, turns
// that into a build-time failure with a clear message instead of a client that
// silently ships a broken supabaseUrl and 500s on every request.
const urlSchema = z
  .string()
  .url()
  .refine((url) => url.startsWith('http://') || url.startsWith('https://'));

// Lazy (called, not evaluated at module scope) so importing this file — or the
// modules that call it — doesn't blow up unit tests that never touch Supabase.
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !urlSchema.safeParse(url).success) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is missing or is not a valid http(s) URL.'
    );
  }
  if (!key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set.');
  }

  return { url, key };
}
