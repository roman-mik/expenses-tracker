-- Horizon Epic B1 — one work calendar per household, plus its holidays.
-- See docs/horizon-epic-b-plan.md §2a. Additive and backward compatible.

create table public.horizon_work_calendars (
  household_id      uuid primary key references public.households(id) on delete cascade,
  working_weekdays  int[] not null default '{1,2,3,4,5}',  -- 0=Sun .. 6=Sat
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint horizon_work_calendars_weekdays_valid
    check (working_weekdays <@ array[0,1,2,3,4,5,6])
);

create trigger horizon_work_calendars_touch_updated_at
  before update on public.horizon_work_calendars
  for each row execute function public.set_updated_at();

alter table public.horizon_work_calendars enable row level security;

create policy "horizon_work_calendars_select" on public.horizon_work_calendars for select using (public.is_household_member(household_id));
create policy "horizon_work_calendars_insert" on public.horizon_work_calendars for insert with check (public.is_household_member(household_id));
create policy "horizon_work_calendars_update" on public.horizon_work_calendars for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "horizon_work_calendars_delete" on public.horizon_work_calendars for delete using (public.is_household_member(household_id));

grant select, insert, update, delete on public.horizon_work_calendars to authenticated;
grant select, insert, update, delete on public.horizon_work_calendars to service_role;

create table public.horizon_holidays (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  date          date not null,
  name          text not null,
  constraint horizon_holidays_unique unique (household_id, date),
  constraint horizon_holidays_name_len check (char_length(btrim(name)) between 1 and 60)
);
create index horizon_holidays_household_idx on public.horizon_holidays (household_id, date);

alter table public.horizon_holidays enable row level security;

create policy "horizon_holidays_select" on public.horizon_holidays for select using (public.is_household_member(household_id));
create policy "horizon_holidays_insert" on public.horizon_holidays for insert with check (public.is_household_member(household_id));
create policy "horizon_holidays_update" on public.horizon_holidays for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "horizon_holidays_delete" on public.horizon_holidays for delete using (public.is_household_member(household_id));

grant select, insert, update, delete on public.horizon_holidays to authenticated;
grant select, insert, update, delete on public.horizon_holidays to service_role;
