-- Horizon Epic B1-B4 — income streams and their payment schedules.
-- See docs/horizon-epic-b-plan.md §2b. Additive and backward compatible.

create table public.horizon_income_streams (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households(id) on delete cascade,
  account_id          uuid not null references public.horizon_accounts(id) on delete cascade,
  name                text not null,
  kind                text not null,                    -- hourly | fixed | variable
  currency            text not null,
  hourly_rate_minor   bigint,                            -- kind = hourly
  hours_per_day_e2    int,                               -- kind = hourly; x100, e.g. 800 = 8.00h
  fixed_amount_minor  bigint,                            -- kind = fixed | variable
  recurrence          text not null default 'recurring', -- recurring | oneOff
  confidence          text not null default 'confirmed', -- confirmed | expected | uncertain
  taxable             boolean not null default true,
  start_date          date not null,
  end_date            date,
  sort_order          int not null default 0,
  archived            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint horizon_income_streams_kind_allowed
    check (kind in ('hourly','fixed','variable')),
  constraint horizon_income_streams_currency_allowed
    check (currency in ('RSD','EUR','USD','RUB')),
  constraint horizon_income_streams_recurrence_allowed
    check (recurrence in ('recurring','oneOff')),
  constraint horizon_income_streams_confidence_allowed
    check (confidence in ('confirmed','expected','uncertain')),
  constraint horizon_income_streams_name_len
    check (char_length(btrim(name)) between 1 and 60),
  constraint horizon_income_streams_end_after_start
    check (end_date is null or end_date >= start_date),
  -- exactly the fields its kind needs, nothing left silently unused
  constraint horizon_income_streams_hourly_fields check (
    (kind = 'hourly' and hourly_rate_minor is not null and hours_per_day_e2 is not null
       and fixed_amount_minor is null)
    or (kind in ('fixed','variable') and fixed_amount_minor is not null
       and hourly_rate_minor is null and hours_per_day_e2 is null)
  )
);
create index horizon_income_streams_household_idx
  on public.horizon_income_streams (household_id, sort_order);

create trigger horizon_income_streams_touch_updated_at
  before update on public.horizon_income_streams
  for each row execute function public.set_updated_at();

alter table public.horizon_income_streams enable row level security;

create policy "horizon_income_streams_select" on public.horizon_income_streams for select using (public.is_household_member(household_id));
create policy "horizon_income_streams_insert" on public.horizon_income_streams for insert with check (public.is_household_member(household_id));
create policy "horizon_income_streams_update" on public.horizon_income_streams for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "horizon_income_streams_delete" on public.horizon_income_streams for delete using (public.is_household_member(household_id));

grant select, insert, update, delete on public.horizon_income_streams to authenticated;
grant select, insert, update, delete on public.horizon_income_streams to service_role;

-- household_id is denormalized here (rather than joined through
-- income_stream_id) so RLS stays a direct is_household_member() check on the
-- row, same precedent as horizon_balance_snapshots (0016) denormalizing off
-- horizon_accounts instead of joining.
create table public.horizon_income_schedules (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households(id) on delete cascade,
  income_stream_id   uuid not null references public.horizon_income_streams(id) on delete cascade,
  kind               text not null,   -- dayOfMonth | monthEnd | everyNDays | nthWeekday | oneOff
  day_of_month       int,             -- kind = dayOfMonth
  interval_days      int,             -- kind = everyNDays
  nth_weekday        int,             -- kind = nthWeekday; 1st..5th
  weekday            int,             -- kind = nthWeekday; 0=Sun..6=Sat
  anchor_date        date,            -- kind = everyNDays | oneOff
  slippage_policy    text not null default 'nextBusinessDay',
  covers_period      text not null default 'same',
  created_at         timestamptz not null default now(),
  constraint horizon_income_schedules_kind_allowed
    check (kind in ('dayOfMonth','monthEnd','everyNDays','nthWeekday','oneOff')),
  constraint horizon_income_schedules_slippage_allowed
    check (slippage_policy in ('nextBusinessDay','prevBusinessDay','none')),
  constraint horizon_income_schedules_covers_allowed
    check (covers_period in ('same','next','previous')),
  constraint horizon_income_schedules_day_of_month_range
    check (day_of_month is null or day_of_month between 1 and 31),
  constraint horizon_income_schedules_nth_weekday_range
    check (nth_weekday is null or nth_weekday between 1 and 5),
  constraint horizon_income_schedules_weekday_range
    check (weekday is null or weekday between 0 and 6)
);
create index horizon_income_schedules_stream_idx
  on public.horizon_income_schedules (income_stream_id);
create index horizon_income_schedules_household_idx
  on public.horizon_income_schedules (household_id);

alter table public.horizon_income_schedules enable row level security;

create policy "horizon_income_schedules_select" on public.horizon_income_schedules for select using (public.is_household_member(household_id));
create policy "horizon_income_schedules_insert" on public.horizon_income_schedules for insert with check (public.is_household_member(household_id));
create policy "horizon_income_schedules_update" on public.horizon_income_schedules for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "horizon_income_schedules_delete" on public.horizon_income_schedules for delete using (public.is_household_member(household_id));

grant select, insert, update, delete on public.horizon_income_schedules to authenticated;
grant select, insert, update, delete on public.horizon_income_schedules to service_role;
