-- Horizon Epic C — daily-accrual spending caps and dated one-off events.
-- See docs/horizon-epic-c-plan.md §2c. Additive and backward compatible.

create table public.horizon_daily_expenses (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households(id) on delete cascade,
  account_id          uuid not null references public.horizon_accounts(id) on delete cascade,
  pocket_category_id  uuid references public.categories(id) on delete set null,
  name                text not null,
  daily_amount_minor  bigint not null,
  currency            text not null,
  charge_cadence      text not null default 'daily',  -- daily | weekly | monthly
  cap_minor           bigint,
  -- also the anchor for weekly charges (date + 7k); an end date stops a
  -- retired budget from accruing forever.
  start_date          date not null,
  end_date            date,
  archived            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint horizon_daily_expenses_currency_allowed
    check (currency in ('RSD','EUR','USD','RUB')),
  constraint horizon_daily_expenses_cadence_allowed
    check (charge_cadence in ('daily','weekly','monthly')),
  constraint horizon_daily_expenses_name_len
    check (char_length(btrim(name)) between 1 and 60),
  constraint horizon_daily_expenses_amount_positive
    check (daily_amount_minor > 0),
  constraint horizon_daily_expenses_cap_positive
    check (cap_minor is null or cap_minor > 0),
  constraint horizon_daily_expenses_end_after_start
    check (end_date is null or end_date >= start_date)
);
create index horizon_daily_expenses_household_idx
  on public.horizon_daily_expenses (household_id);

create trigger horizon_daily_expenses_touch_updated_at
  before update on public.horizon_daily_expenses
  for each row execute function public.set_updated_at();

alter table public.horizon_daily_expenses enable row level security;

create policy "horizon_daily_expenses_select" on public.horizon_daily_expenses for select using (public.is_household_member(household_id));
create policy "horizon_daily_expenses_insert" on public.horizon_daily_expenses for insert with check (public.is_household_member(household_id));
create policy "horizon_daily_expenses_update" on public.horizon_daily_expenses for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "horizon_daily_expenses_delete" on public.horizon_daily_expenses for delete using (public.is_household_member(household_id));

grant select, insert, update, delete on public.horizon_daily_expenses to authenticated;
grant select, insert, update, delete on public.horizon_daily_expenses to service_role;

create table public.horizon_one_off_events (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  account_id     uuid not null references public.horizon_accounts(id) on delete cascade,
  name           text not null,
  category       text not null,
  amount_minor   bigint not null,
  currency       text not null,
  date           date not null,
  direction      text not null,   -- in | out
  created_at     timestamptz not null default now(),
  constraint horizon_one_off_events_currency_allowed
    check (currency in ('RSD','EUR','USD','RUB')),
  constraint horizon_one_off_events_direction_allowed
    check (direction in ('in','out')),
  constraint horizon_one_off_events_category_allowed
    check (category in ('housing','utilities','debt','subscriptions','insurance',
                         'transport','family','gift','bonus','other')),
  constraint horizon_one_off_events_name_len
    check (char_length(btrim(name)) between 1 and 60),
  constraint horizon_one_off_events_amount_positive
    check (amount_minor > 0)
);
create index horizon_one_off_events_household_idx
  on public.horizon_one_off_events (household_id, date);

alter table public.horizon_one_off_events enable row level security;

create policy "horizon_one_off_events_select" on public.horizon_one_off_events for select using (public.is_household_member(household_id));
create policy "horizon_one_off_events_insert" on public.horizon_one_off_events for insert with check (public.is_household_member(household_id));
create policy "horizon_one_off_events_update" on public.horizon_one_off_events for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "horizon_one_off_events_delete" on public.horizon_one_off_events for delete using (public.is_household_member(household_id));

grant select, insert, update, delete on public.horizon_one_off_events to authenticated;
grant select, insert, update, delete on public.horizon_one_off_events to service_role;
