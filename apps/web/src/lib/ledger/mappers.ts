/**
 * Row -> domain mappers for the ledger, same idiom as `@/lib/mappers`.
 */
import type { HouseholdRow } from '@/lib/mappers';
import type { Currency, Money } from '@/lib/types';
import type { Database } from '@/lib/supabase/database.types';
import type { AccountType, LedgerAccount, LedgerSettings } from './types';

type Tables = Database['public']['Tables'];
type Row<T extends keyof Tables> = Tables[T]['Row'];

export type LedgerAccountRow = Row<'ledger_accounts'>;

const money = (n: number): Money => n as Money;

export function toLedgerAccount(row: LedgerAccountRow): LedgerAccount {
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

export function toLedgerSettings(
  row: Pick<HouseholdRow, 'ledger_reporting_currency'>
): LedgerSettings {
  return {
    reportingCurrency: row.ledger_reporting_currency as Currency,
  };
}
