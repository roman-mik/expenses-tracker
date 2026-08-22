-- Horizon Epic C — obligations and their payment schedules.
-- See docs/horizon-epic-c-plan.md §2b. Additive and backward compatible.
-- Column-for-column the same shape as horizon_income_streams/_schedules
-- (0019) — a household can owe rent on the 28th and a card payment on the
-- 5th, so the schedule is a child table, not flat columns.

create table public.horizon_obligations (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households(id) on delete cascade,
  account_id        uuid not null references public.horizon_accounts(id) on delete cascade,
  name              text not null,
  category          text not null,
  amount_minor      bigint not null,                   -- per occurrence, never a monthly total (D1)
  currency          text not null,
  recurrence        text not null default 'recurring', -- recurring | oneOff
  confidence        text not null default 'confirmed', -- confirmed | expected | uncertain
  start_date        date not null,
  end_date          date,
  sort_order        int not null default 0,
  archived          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint horizon_obligations_category_allowed
    check (category in ('housing','utilities','debt','subscriptions','insurance',
                         'transport','family','other')),
  constraint horizon_obligations_currency_allowed
    check (currency in ('RSD','EUR','USD','RUB')),
  constraint horizon_obligations_recurrence_allowed
    check (recurrence in ('recurring','oneOff')),
  constraint horizon_obligations_confidence_allowed
    check (confidence in ('confirmed','expected','uncertain')),
  constraint horizon_obligations_name_len
    check (char_length(btrim(name)) between 1 and 60),
  constraint horizon_obligations_end_after_start
    check (end_date is null or end_date >= start_date)
);
create index horizon_obligations_household_idx
  on public.horizon_obligations (household_id, sort_order);

create trigger horizon_obligations_touch_updated_at
  before update on public.horizon_obligations
  for each row execute function public.set_updated_at();

alter table public.horizon_obligations enable row level security;

create policy "horizon_obligations_select" on public.horizon_obligations for select using (public.is_household_member(household_id));
create policy "horizon_obligations_insert" on public.horizon_obligations for insert with check (public.is_household_member(household_id));
create policy "horizon_obligations_update" on public.horizon_obligations for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "horizon_obligations_delete" on public.horizon_obligations for delete using (public.is_household_member(household_id));

grant select, insert, update, delete on public.horizon_obligations to authenticated;
grant select, insert, update, delete on public.horizon_obligations to service_role;

-- household_id is denormalized here for the same reason as
-- horizon_income_schedules (0019): every RLS policy stays a direct
-- is_household_member() check, no join.
create table public.horizon_obligation_schedules (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households(id) on delete cascade,
  obligation_id      uuid not null references public.horizon_obligations(id) on delete cascade,
  kind               text not null,   -- dayOfMonth | monthEnd | everyNDays | nthWeekday | oneOff
  day_of_month       int,
  interval_days      int,
  nth_weekday        int,
  weekday            int,
  anchor_date        date,
  slippage_policy    text not null default 'nextBusinessDay',
  covers_period      text not null default 'same',   -- same | next | previous (C2)
  created_at         timestamptz not null default now(),
  constraint horizon_obligation_schedules_kind_allowed
    check (kind in ('dayOfMonth','monthEnd','everyNDays','nthWeekday','oneOff')),
  constraint horizon_obligation_schedules_slippage_allowed
    check (slippage_policy in ('nextBusinessDay','prevBusinessDay','none')),
  constraint horizon_obligation_schedules_covers_allowed
    check (covers_period in ('same','next','previous')),
  constraint horizon_obligation_schedules_day_of_month_range
    check (day_of_month is null or day_of_month between 1 and 31),
  constraint horizon_obligation_schedules_nth_weekday_range
    check (nth_weekday is null or nth_weekday between 1 and 5),
  constraint horizon_obligation_schedules_weekday_range
    check (weekday is null or weekday between 0 and 6)
);
create index horizon_obligation_schedules_obligation_idx
  on public.horizon_obligation_schedules (obligation_id);
create index horizon_obligation_schedules_household_idx
  on public.horizon_obligation_schedules (household_id);

alter table public.horizon_obligation_schedules enable row level security;

create policy "horizon_obligation_schedules_select" on public.horizon_obligation_schedules for select using (public.is_household_member(household_id));
create policy "horizon_obligation_schedules_insert" on public.horizon_obligation_schedules for insert with check (public.is_household_member(household_id));
create policy "horizon_obligation_schedules_update" on public.horizon_obligation_schedules for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "horizon_obligation_schedules_delete" on public.horizon_obligation_schedules for delete using (public.is_household_member(household_id));

grant select, insert, update, delete on public.horizon_obligation_schedules to authenticated;
grant select, insert, update, delete on public.horizon_obligation_schedules to service_role;
