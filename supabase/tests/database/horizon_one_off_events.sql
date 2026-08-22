-- pgTAP RLS isolation suite for horizon_one_off_events (0021_horizon_daily_expenses.sql).
-- Run with: supabase test db
--
-- Mirrors horizon_obligations.sql's alice/bob shape.

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
  ('pgtap-one-off-alice@example.com'), ('pgtap-one-off-bob@example.com');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'alice_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-one-off-alice@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  (:'bob_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-one-off-bob@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now());

select household_id as alice_household from public.household_members where user_id = :'alice_id' \gset
select household_id as bob_household from public.household_members where user_id = :'bob_id' \gset

insert into public.horizon_accounts (household_id, name, currency, type)
  values (:'alice_household', 'Alice checking', 'RSD', 'personal')
  returning id as alice_account \gset

insert into public.horizon_one_off_events
  (household_id, account_id, name, category, amount_minor, currency, date, direction)
  values (:'alice_household', :'alice_account', 'Alice car repair', 'transport', 15000, 'RSD', '2026-02-01', 'out');

-- ---------------------------------------------------------------------------
-- Check constraints.
-- ---------------------------------------------------------------------------

select throws_ok(
  format($$ insert into public.horizon_one_off_events
            (household_id, account_id, name, category, amount_minor, currency, date, direction)
            values (%L, %L, 'Bad direction', 'other', 1000, 'RSD', '2026-02-01', 'sideways') $$,
    :'alice_household', :'alice_account'),
  '23514', null,
  'an unsupported direction violates the check constraint');

select throws_ok(
  format($$ insert into public.horizon_one_off_events
            (household_id, account_id, name, category, amount_minor, currency, date, direction)
            values (%L, %L, 'Bad category', 'not-a-category', 1000, 'RSD', '2026-02-01', 'in') $$,
    :'alice_household', :'alice_account'),
  '23514', null,
  'an unsupported category violates the check constraint');

-- ---------------------------------------------------------------------------
-- Alice logs in: sees and can write her own household's one-off event.
-- ---------------------------------------------------------------------------

select tests.login_as(:'alice_id');

select is(
  (select count(*)::int from public.horizon_one_off_events where household_id = :'alice_household'),
  1, 'alice sees her own one-off event');

select lives_ok(
  format($$ insert into public.horizon_one_off_events
            (household_id, account_id, name, category, amount_minor, currency, date, direction)
            values (%L, %L, 'Alice bonus', 'bonus', 20000, 'RSD', '2026-03-01', 'in') $$,
    :'alice_household', :'alice_account'),
  'alice can insert a one-off event into her own household');

-- ---------------------------------------------------------------------------
-- Bob logs in: alice's one-off events are invisible and unwritable.
-- ---------------------------------------------------------------------------

select tests.login_as(:'bob_id');

select is(
  (select count(*)::int from public.horizon_one_off_events where household_id = :'alice_household'),
  0, 'bob sees zero one-off events from alice''s household');

select throws_ok(
  format($$ insert into public.horizon_one_off_events
            (household_id, account_id, name, category, amount_minor, currency, date, direction)
            values (%L, %L, 'Snooping', 'other', 1, 'RSD', '2026-02-01', 'out') $$,
    :'alice_household', :'alice_account'),
  '42501', null,
  'bob cannot insert a one-off event into alice''s household');

with d as (
  delete from public.horizon_one_off_events where household_id = :'alice_household' returning 1
)
select is((select count(*)::int from d), 0, 'bob''s delete of alice''s one-off events touches zero rows');

select * from finish();
rollback;
