import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Supabase free projects pause after ~7 days of inactivity (see PLAN.md §6).
 * Vercel's cron (`vercel.json`) hits this daily with a `CRON_SECRET` bearer
 * token, set automatically by Vercel when the env var exists. One trivial
 * read is enough to register activity — no data is returned.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from('households').select('id').limit(1);
  if (error) {
    console.error('GET /api/keepalive failed', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
