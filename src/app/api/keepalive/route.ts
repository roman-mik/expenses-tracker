import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/observability';

/**
 * Best-effort ping to a healthchecks.io check — a dead-man's switch that
 * catches what this route's own 200/500 response can't: if Vercel's cron
 * stops firing entirely, nothing here runs to report that. healthchecks.io
 * flags the check as down once its expected-ping window passes, independent
 * of whether we ever got a chance to ping it. `/fail` reports a bad ping
 * without waiting for that timeout. A ping failure must never fail this
 * route, and the check is skipped entirely (not even attempted) when
 * HEALTHCHECK_URL is unset, so local/preview environments are unaffected.
 */
async function pingHealthcheck(ok: boolean) {
  const base = process.env.HEALTHCHECK_URL;
  if (!base) return;
  try {
    await fetch(ok ? base : `${base}/fail`, { method: 'GET' });
  } catch (error) {
    reportError('keepalive.pingHealthcheck', error);
  }
}

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
    reportError('keepalive', error);
    await pingHealthcheck(false);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  await pingHealthcheck(true);
  return NextResponse.json({ ok: true });
}
