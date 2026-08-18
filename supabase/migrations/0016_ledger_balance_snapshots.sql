-- Ledger Epic A4 — account balance reconciliation snapshots. See docs/ledger-epic-a-plan.md §2c.

create table public.ledger_balance_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households(id) on delete cascade,
  account_id          uuid not null references public.ledger_accounts(id) on delete cascade,
  balance_minor       bigint not null,      -- what the user entered
  expected_minor      bigint not null,      -- what the app had stored
  currency            text not null,
  recorded_at         timestamptz not null default now(),
  note                text,
  constraint ledger_balance_snapshots_currency_allowed check (currency in ('RSD','EUR','USD','RUB'))
);

create index ledger_balance_snapshots_household_idx on public.ledger_balance_snapshots (household_id, recorded_at desc);
create index ledger_balance_snapshots_account_idx on public.ledger_balance_snapshots (account_id, recorded_at desc);

alter table public.ledger_balance_snapshots enable row level security;

create policy "ledger_balance_snapshots_select" on public.ledger_balance_snapshots for select using (public.is_household_member(household_id));
create policy "ledger_balance_snapshots_insert" on public.ledger_balance_snapshots for insert with check (public.is_household_member(household_id));
create policy "ledger_balance_snapshots_update" on public.ledger_balance_snapshots for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "ledger_balance_snapshots_delete" on public.ledger_balance_snapshots for delete using (public.is_household_member(household_id));

grant select, insert, update, delete on public.ledger_balance_snapshots to authenticated;
grant select, insert, update, delete on public.ledger_balance_snapshots to service_role;
