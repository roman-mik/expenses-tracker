/**
 * FX snapshot reads, same idiom as `@/lib/ledger/queries/accounts`. Global
 * reference data — no household scoping (see 0015_ledger_fx_rates.sql).
 * Returns every stored snapshot rather than "just the latest": `pickRate`
 * (lib/ledger/fx.ts) needs the full history to answer "as of a given date",
 * which is what makes a view pinned to an older day reproducible.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { FxRate } from '../types';
import { toFxRate, type LedgerFxRateRow } from '../mappers';

const FX_RATE_COLUMNS = 'base_code, quote_code, rate_e8, as_of_date, source';

export async function getLedgerFxRates(
  supabase: SupabaseServerClient
): Promise<FxRate[]> {
  const { data, error } = await supabase
    .from('ledger_fx_rates')
    .select(FX_RATE_COLUMNS)
    .order('as_of_date', { ascending: false });

  if (error) throw new Error(error.message);
  return (data as LedgerFxRateRow[]).map(toFxRate);
}
