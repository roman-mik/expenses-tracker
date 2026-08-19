-- Migration: Rename ledger tables and columns to horizon
-- Deliberately breaks backward compatibility by renaming existing tables/columns/constraints/indexes.

alter table public.ledger_accounts          rename to horizon_accounts;
alter table public.ledger_fx_rates          rename to horizon_fx_rates;
alter table public.ledger_balance_snapshots rename to horizon_balance_snapshots;

-- horizon_accounts: pkey, fkey, 3 checks, 1 index, 1 trigger, 4 policies
alter table public.horizon_accounts rename constraint ledger_accounts_pkey
  to horizon_accounts_pkey;
alter table public.horizon_accounts rename constraint ledger_accounts_household_id_fkey
  to horizon_accounts_household_id_fkey;
alter table public.horizon_accounts rename constraint ledger_accounts_currency_allowed
  to horizon_accounts_currency_allowed;
alter table public.horizon_accounts rename constraint ledger_accounts_type_allowed
  to horizon_accounts_type_allowed;
alter table public.horizon_accounts rename constraint ledger_accounts_name_len
  to horizon_accounts_name_len;
alter index public.ledger_accounts_household_idx
  rename to horizon_accounts_household_idx;
alter trigger ledger_accounts_touch_updated_at on public.horizon_accounts
  rename to horizon_accounts_touch_updated_at;
alter policy "ledger_accounts_select" on public.horizon_accounts
  rename to "horizon_accounts_select";
alter policy "ledger_accounts_insert" on public.horizon_accounts
  rename to "horizon_accounts_insert";
alter policy "ledger_accounts_update" on public.horizon_accounts
  rename to "horizon_accounts_update";
alter policy "ledger_accounts_delete" on public.horizon_accounts
  rename to "horizon_accounts_delete";

-- horizon_fx_rates: pkey, rate check, 3 checks, 1 policy
alter table public.horizon_fx_rates rename constraint ledger_fx_rates_pkey
  to horizon_fx_rates_pkey;
alter table public.horizon_fx_rates rename constraint ledger_fx_rates_rate_e8_check
  to horizon_fx_rates_rate_e8_check;
alter table public.horizon_fx_rates rename constraint ledger_fx_rates_base_allowed
  to horizon_fx_rates_base_allowed;
alter table public.horizon_fx_rates rename constraint ledger_fx_rates_quote_allowed
  to horizon_fx_rates_quote_allowed;
alter table public.horizon_fx_rates rename constraint ledger_fx_rates_distinct
  to horizon_fx_rates_distinct;
alter policy "ledger_fx_rates_select" on public.horizon_fx_rates
  rename to "horizon_fx_rates_select";

-- horizon_balance_snapshots: pkey, 2 fkeys (household_id, account_id), 1 check, 2 indexes, 4 policies
alter table public.horizon_balance_snapshots rename constraint ledger_balance_snapshots_pkey
  to horizon_balance_snapshots_pkey;
alter table public.horizon_balance_snapshots rename constraint ledger_balance_snapshots_household_id_fkey
  to horizon_balance_snapshots_household_id_fkey;
alter table public.horizon_balance_snapshots rename constraint ledger_balance_snapshots_account_id_fkey
  to horizon_balance_snapshots_account_id_fkey;
alter table public.horizon_balance_snapshots rename constraint ledger_balance_snapshots_currency_allowed
  to horizon_balance_snapshots_currency_allowed;
alter index public.ledger_balance_snapshots_household_idx
  rename to horizon_balance_snapshots_household_idx;
alter index public.ledger_balance_snapshots_account_idx
  rename to horizon_balance_snapshots_account_idx;
alter policy "ledger_balance_snapshots_select" on public.horizon_balance_snapshots
  rename to "horizon_balance_snapshots_select";
alter policy "ledger_balance_snapshots_insert" on public.horizon_balance_snapshots
  rename to "horizon_balance_snapshots_insert";
alter policy "ledger_balance_snapshots_update" on public.horizon_balance_snapshots
  rename to "horizon_balance_snapshots_update";
alter policy "ledger_balance_snapshots_delete" on public.horizon_balance_snapshots
  rename to "horizon_balance_snapshots_delete";

-- shared households column
alter table public.households
  rename column ledger_reporting_currency to horizon_reporting_currency;
alter table public.households
  rename constraint households_ledger_reporting_currency_allowed
  to households_horizon_reporting_currency_allowed;
