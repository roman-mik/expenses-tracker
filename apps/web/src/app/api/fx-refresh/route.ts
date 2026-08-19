import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { reportError } from '@/lib/observability';
import { CURRENCIES } from '@/lib/types';

const PROVIDER = 'open.er-api.com';
const RATE_SCALE = 100_000_000;

type FxRateInsert = {
  base_code: string;
  quote_code: string;
  rate_e8: number;
  as_of_date: string;
  source: string;
};

/**
 * ECB reference rates (and Frankfurter, which mirrors them) don't publish
 * RSD and dropped RUB in 2022 — the two currencies that matter most here.
 * open.er-api.com is free, keyless, and covers all four. Its response is
 * one currency's rates against every other, so fetching once per household
 * currency gives every pair as a *direct* rate rather than one derived by
 * inverting a division — see lib/horizon/fx.ts's module comment on why that
 * matters for reproducibility.
 */
async function fetchRatesFor(base: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
  if (!res.ok) {
    throw new Error(`FX provider returned ${res.status} for base ${base}`);
  }
  const body = await res.json();
  if (body.result !== 'success' || typeof body.rates !== 'object') {
    throw new Error(`FX provider reported failure for base ${base}`);
  }
  return body.rates as Record<string, unknown>;
}

/**
 * Daily FX snapshot refresh, guarded by Vercel's cron bearer token
 * (`vercel.json`), modelled on `/api/keepalive`.
 *
 * All-or-nothing: every currency's rates are fetched and validated before
 * anything is written. If the provider omits or corrupts even one of the
 * four currencies, nothing is written at all — yesterday's snapshot staying
 * in place is correct; a partial or zeroed rate would silently corrupt every
 * total on the Today screen.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const asOfDate = new Date().toISOString().slice(0, 10);
  const rows: FxRateInsert[] = [];

  try {
    for (const base of CURRENCIES) {
      const rates = await fetchRatesFor(base);
      for (const quote of CURRENCIES) {
        if (quote === base) continue;
        const rate = rates[quote];
        if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
          throw new Error(
            `FX provider omitted or gave an invalid rate for ${base} -> ${quote}`
          );
        }
        rows.push({
          base_code: base,
          quote_code: quote,
          rate_e8: Math.round(rate * RATE_SCALE),
          as_of_date: asOfDate,
          source: PROVIDER,
        });
      }
    }
  } catch (error) {
    reportError('fx-refresh.fetch', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from('horizon_fx_rates')
    .upsert(rows, { onConflict: 'base_code,quote_code,as_of_date' });

  if (error) {
    reportError('fx-refresh.write', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: rows.length });
}
