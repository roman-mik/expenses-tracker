-- Ledger Epic A1/A2 — accounts and the household's reporting currency.
-- See docs/ledger-epic-a-plan.md §2a. Additive and backward compatible:
-- `release-please.yml` runs `supabase db push` before the Vercel deploy, so
-- nothing here may break the currently-deployed app.

-- ---------------------------------------------------------------------------
-- 1. Generic updated_at trigger function, extracted from
--    0011_expense_updated_at.sql's expense-specific one so ledger_accounts
--    (and any future table) can reuse it instead of growing its own copy.
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists expenses_touch_updated_at on public.expenses;
create trigger expenses_touch_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

drop function if exists public.expenses_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. ledger_accounts
-- ---------------------------------------------------------------------------

create table public.ledger_accounts (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references public.households(id) on delete cascade,
  name                  text not null,
  currency              text not null,
  current_balance_minor bigint not null default 0,   -- MAY be negative (overdraft); no check
  type                  text not null,
  include_in_total      boolean not null default true,
  sort_order            int not null default 0,
  archived              boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint ledger_accounts_currency_allowed check (currency in ('RSD','EUR','USD','RUB')),
  constraint ledger_accounts_type_allowed     check (type in ('business','personal','savings')),
  constraint ledger_accounts_name_len         check (char_length(btrim(name)) between 1 and 60)
);
create index ledger_accounts_household_idx on public.ledger_accounts (household_id, sort_order);

create trigger ledger_accounts_touch_updated_at
  before update on public.ledger_accounts
  for each row execute function public.set_updated_at();

alter table public.ledger_accounts enable row level security;

create policy "ledger_accounts_select" on public.ledger_accounts for select using (public.is_household_member(household_id));
create policy "ledger_accounts_insert" on public.ledger_accounts for insert with check (public.is_household_member(household_id));
create policy "ledger_accounts_update" on public.ledger_accounts for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "ledger_accounts_delete" on public.ledger_accounts for delete using (public.is_household_member(household_id));

grant select, insert, update, delete on public.ledger_accounts to authenticated;
grant select, insert, update, delete on public.ledger_accounts to service_role;

-- ---------------------------------------------------------------------------
-- 3. households.ledger_reporting_currency — backfilled from the existing
--    Kapa currency so households keep the unit they already think in.
--    households.currency itself is untouched (D15: source amounts never
--    silently move).
-- ---------------------------------------------------------------------------

alter table public.households add column ledger_reporting_currency text;
update public.households set ledger_reporting_currency = currency;
alter table public.households
  alter column ledger_reporting_currency set not null,
  alter column ledger_reporting_currency set default 'RSD',
  add constraint households_ledger_reporting_currency_allowed
    check (ledger_reporting_currency in ('RSD','EUR','USD','RUB'));
