-- pgTAP RLS isolation suite for horizon_income_schedules (0019_horizon_income_streams.sql).
-- Run with: supabase test db
--
-- household_id is denormalized onto the schedule row (see the migration's
-- comment), so RLS here is a direct check, same shape as every other suite.

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

select plan(6);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

select gen_random_uuid() as alice_id \gset
select gen_random_uuid() as bob_id \gset

insert into public.allowed_emails (email) values
  ('pgtap-schedule-alice@example.com'), ('pgtap-schedule-bob@example.com');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'alice_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-schedule-alice@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  (:'bob_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-schedule-bob@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now());

select household_id as alice_household from public.household_members where user_id = :'alice_id' \gset

insert into public.horizon_accounts (household_id, name, currency, type)
  values (:'alice_household', 'Alice checking', 'RSD', 'personal')
  returning id as alice_account \gset

insert into public.horizon_income_streams
  (household_id, account_id, name, kind, currency, fixed_amount_minor, start_date)
  values (:'alice_household', :'alice_account', 'Alice retainer', 'fixed', 'RSD', 100000, '2026-01-01')
  returning id as alice_stream \gset

insert into public.horizon_income_schedules (household_id, income_stream_id, kind, day_of_month)
  values (:'alice_household', :'alice_stream', 'dayOfMonth', 15);

-- ---------------------------------------------------------------------------
-- Alice logs in: sees and can write her own household's schedule.
-- ---------------------------------------------------------------------------

select tests.login_as(:'alice_id');

select is(
  (select count(*)::int from public.horizon_income_schedules where household_id = :'alice_household'),
  1, 'alice sees her own schedule');

select lives_ok(
  format($$ insert into public.horizon_income_schedules (household_id, income_stream_id, kind)
            values (%L, %L, 'monthEnd') $$, :'alice_household', :'alice_stream'),
  'alice can add a second schedule to her own stream');

-- ---------------------------------------------------------------------------
-- Bob logs in: alice's schedules are invisible and unwritable.
-- ---------------------------------------------------------------------------

select tests.login_as(:'bob_id');

select is(
  (select count(*)::int from public.horizon_income_schedules where household_id = :'alice_household'),
  0, 'bob sees zero schedules from alice''s household');

select throws_ok(
  format($$ insert into public.horizon_income_schedules (household_id, income_stream_id, kind)
            values (%L, %L, 'monthEnd') $$, :'alice_household', :'alice_stream'),
  '42501', null,
  'bob cannot insert a schedule into alice''s household');

with d as (
  delete from public.horizon_income_schedules where household_id = :'alice_household' returning 1
)
select is((select count(*)::int from d), 0, 'bob''s delete of alice''s schedules touches zero rows');

-- ---------------------------------------------------------------------------
-- Cascade: deleting the stream removes its schedules.
-- ---------------------------------------------------------------------------

select tests.login_as(:'alice_id');

delete from public.horizon_income_streams where id = :'alice_stream';

select is(
  (select count(*)::int from public.horizon_income_schedules where income_stream_id = :'alice_stream'),
  0, 'deleting the stream cascades to its schedules');

select * from finish();
rollback;
