-- pgTAP RLS isolation suite for horizon_work_calendars and horizon_holidays
-- (0018_horizon_work_calendar.sql).
-- Run with: supabase test db

begin;

create schema if not exists tests;
grant usage on schema tests to authenticated;
create or replace function tests.login_as(uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$ language plpgsql;
create or replace function tests.logout() returns void as $$
begin
  perform set_config('request.jwt.claims', null, true);
  perform set_config('request.jwt.claim.sub', null, true);
  execute 'reset role';
end $$ language plpgsql;
grant execute on function tests.login_as(uuid) to authenticated;
grant execute on function tests.logout() to authenticated;

select plan(7);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

select gen_random_uuid() as alice_id \gset
select gen_random_uuid() as bob_id \gset

insert into public.allowed_emails (email) values
  ('pgtap-calendar-alice@example.com'), ('pgtap-calendar-bob@example.com');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'alice_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-calendar-alice@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  (:'bob_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-calendar-bob@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now());

select household_id as alice_household from public.household_members where user_id = :'alice_id' \gset
select household_id as bob_household from public.household_members where user_id = :'bob_id' \gset

insert into public.horizon_work_calendars (household_id, working_weekdays)
  values (:'alice_household', array[1,2,3,4,5]);

insert into public.horizon_holidays (household_id, date, name)
  values (:'alice_household', '2026-01-01', 'New Year''s Day');

-- ---------------------------------------------------------------------------
-- Constraint: working_weekdays must be a subset of 0..6.
-- ---------------------------------------------------------------------------

select throws_ok(
  format($$ insert into public.horizon_work_calendars (household_id, working_weekdays)
            values (%L, array[7]) $$, :'bob_household'),
  '23514', null,
  'a weekday outside 0..6 violates the check constraint');

-- ---------------------------------------------------------------------------
-- Alice logs in: sees and can write her own household's calendar/holidays.
-- ---------------------------------------------------------------------------

select tests.login_as(:'alice_id');

select is(
  (select working_weekdays from public.horizon_work_calendars where household_id = :'alice_household'),
  array[1,2,3,4,5], 'alice sees her own work calendar');

select is(
  (select count(*)::int from public.horizon_holidays where household_id = :'alice_household'),
  1, 'alice sees her own holiday');

select lives_ok(
  format($$ update public.horizon_work_calendars set working_weekdays = array[1,2,3,4] where household_id = %L $$,
    :'alice_household'),
  'alice can update her own work calendar');

-- ---------------------------------------------------------------------------
-- Bob logs in: alice's calendar/holidays are invisible and unwritable.
-- ---------------------------------------------------------------------------

select tests.login_as(:'bob_id');

select is(
  (select count(*)::int from public.horizon_work_calendars where household_id = :'alice_household'),
  0, 'bob sees zero rows of alice''s work calendar');

select is(
  (select count(*)::int from public.horizon_holidays where household_id = :'alice_household'),
  0, 'bob sees zero of alice''s holidays');

with u as (
  update public.horizon_work_calendars set working_weekdays = array[1] where household_id = :'alice_household' returning 1
)
select is((select count(*)::int from u), 0, 'bob''s update of alice''s work calendar touches zero rows');

select * from finish();
rollback;
