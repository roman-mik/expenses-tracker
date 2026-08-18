-- Ledger Epic A3 — FX rate snapshots. See docs/ledger-epic-a-plan.md §2b.
--
-- Global reference data, not household-scoped: the same rate serves every
-- household, and per-household copies would drift. `rate_e8` is an integer
-- (rate x 10^8) rather than `numeric`, matching this codebase's integer-money
-- discipline (lib/types.ts) and avoiding a string round-trip through
-- PostgREST — see the plan doc for the full rationale.

create table public.ledger_fx_rates (
  base_code  text not null,
  quote_code text not null,
  rate_e8    bigint not null check (rate_e8 > 0),  -- rate x 10^8, integer
  as_of_date date not null,
  source     text not null,
  fetched_at timestamptz not null default now(),
  primary key (base_code, quote_code, as_of_date),
  constraint ledger_fx_rates_base_allowed  check (base_code  in ('RSD','EUR','USD','RUB')),
  constraint ledger_fx_rates_quote_allowed check (quote_code in ('RSD','EUR','USD','RUB')),
  constraint ledger_fx_rates_distinct      check (base_code <> quote_code)
);

alter table public.ledger_fx_rates enable row level security;

-- Rates are not secret: any authenticated user may read them. Only
-- service_role may write — the daily cron is the single writer, so no client
-- can forge a rate (no insert/update/delete policy for `authenticated`).
create policy "ledger_fx_rates_select" on public.ledger_fx_rates for select using (true);

grant select on public.ledger_fx_rates to authenticated;
grant select, insert, update, delete on public.ledger_fx_rates to service_role;
