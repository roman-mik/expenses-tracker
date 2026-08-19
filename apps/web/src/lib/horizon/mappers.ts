/**
 * Row -> domain mappers for the horizon, same idiom as `@/lib/mappers`.
 */
import type { HouseholdRow } from '@/lib/mappers';
import type { Currency, Money } from '@/lib/types';
import type { Database } from '@/lib/supabase/database.types';
import type {
  AccountType,
  FxRate,
  HorizonAccount,
  HorizonBalanceSnapshot,
  HorizonSettings,
} from './types';

type Tables = Database['public']['Tables'];
type Row<T extends keyof Tables> = Tables[T]['Row'];

export type HorizonAccountRow = Row<'horizon_accounts'>;
export type HorizonFxRateRow = Row<'horizon_fx_rates'>;
export type HorizonBalanceSnapshotRow = Row<'horizon_balance_snapshots'>;

const money = (n: number): Money => n as Money;

export function toHorizonAccount(row: HorizonAccountRow): HorizonAccount {
  return {
    id: row.id,
    name: row.name,
    currency: row.currency as Currency,
    currentBalanceMinor: money(row.current_balance_minor),
    type: row.type as AccountType,
    includeInTotal: row.include_in_total,
    sortOrder: row.sort_order,
    archived: row.archived,
  };
}

export function toHorizonSettings(
  row: Pick<HouseholdRow, 'horizon_reporting_currency'>
): HorizonSettings {
  return {
    reportingCurrency: row.horizon_reporting_currency as Currency,
  };
}

export function toFxRate(row: HorizonFxRateRow): FxRate {
  return {
    baseCode: row.base_code as Currency,
    quoteCode: row.quote_code as Currency,
    rateE8: row.rate_e8,
    asOfDate: row.as_of_date,
    source: row.source,
  };
}

export function toHorizonBalanceSnapshot(
  row: HorizonBalanceSnapshotRow
): HorizonBalanceSnapshot {
  const balanceMinor = money(row.balance_minor);
  const expectedMinor = money(row.expected_minor);
  return {
    id: row.id,
    householdId: row.household_id,
    accountId: row.account_id,
    balanceMinor,
    expectedMinor,
    varianceMinor: money(row.balance_minor - row.expected_minor),
    currency: row.currency as Currency,
    recordedAt: row.recorded_at,
    note: row.note,
  };
}
