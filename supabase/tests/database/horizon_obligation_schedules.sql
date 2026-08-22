-- pgTAP RLS isolation suite for horizon_obligation_schedules (0020_horizon_obligations.sql).
-- Run with: supabase test db
--
-- household_id is denormalized onto the schedule row (see the migration's
-- comment), so RLS here is a direct check, same shape as horizon_income_schedules.sql.

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
  ('pgtap-obligation-schedule-alice@example.com'), ('pgtap-obligation-schedule-bob@example.com');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'alice_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-obligation-schedule-alice@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  (:'bob_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-obligation-schedule-bob@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now());

select household_id as alice_household from public.household_members where user_id = :'alice_id' \gset

insert into public.horizon_accounts (household_id, name, currency, type)
  values (:'alice_household', 'Alice checking', 'RSD', 'personal')
  returning id as alice_account \gset

insert into public.horizon_obligations
  (household_id, account_id, name, category, amount_minor, currency, start_date)
  values (:'alice_household', :'alice_account', 'Alice rent', 'housing', 50000, 'RSD', '2026-01-01')
  returning id as alice_obligation \gset

insert into public.horizon_obligation_schedules (household_id, obligation_id, kind, day_of_month, covers_period)
  values (:'alice_household', :'alice_obligation', 'dayOfMonth', 28, 'next');

-- ---------------------------------------------------------------------------
-- Alice logs in: sees and can write her own household's schedule.
-- ---------------------------------------------------------------------------

select tests.login_as(:'alice_id');

select is(
  (select count(*)::int from public.horizon_obligation_schedules where household_id = :'alice_household'),
  1, 'alice sees her own schedule');

select lives_ok(
  format($$ insert into public.horizon_obligation_schedules (household_id, obligation_id, kind)
            values (%L, %L, 'monthEnd') $$, :'alice_household', :'alice_obligation'),
  'alice can add a second schedule to her own obligation');

-- ---------------------------------------------------------------------------
-- Bob logs in: alice's schedules are invisible and unwritable.
-- ---------------------------------------------------------------------------

select tests.login_as(:'bob_id');

select is(
  (select count(*)::int from public.horizon_obligation_schedules where household_id = :'alice_household'),
  0, 'bob sees zero schedules from alice''s household');

select throws_ok(
  format($$ insert into public.horizon_obligation_schedules (household_id, obligation_id, kind)
            values (%L, %L, 'monthEnd') $$, :'alice_household', :'alice_obligation'),
  '42501', null,
  'bob cannot insert a schedule into alice''s household');

with d as (
  delete from public.horizon_obligation_schedules where household_id = :'alice_household' returning 1
)
select is((select count(*)::int from d), 0, 'bob''s delete of alice''s schedules touches zero rows');

-- ---------------------------------------------------------------------------
-- Cascade: deleting the obligation removes its schedules.
-- ---------------------------------------------------------------------------

select tests.login_as(:'alice_id');

delete from public.horizon_obligations where id = :'alice_obligation';

select is(
  (select count(*)::int from public.horizon_obligation_schedules where obligation_id = :'alice_obligation'),
  0, 'deleting the obligation cascades to its schedules');

select * from finish();
rollback;
