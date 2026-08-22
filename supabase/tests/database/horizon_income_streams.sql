-- pgTAP RLS isolation suite for horizon_income_streams (0019_horizon_income_streams.sql).
-- Run with: supabase test db
--
-- Mirrors horizon_accounts.sql's alice/bob shape, plus the hourly/fixed
-- field-presence check constraint.

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

select plan(8);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

select gen_random_uuid() as alice_id \gset
select gen_random_uuid() as bob_id \gset

insert into public.allowed_emails (email) values
  ('pgtap-income-alice@example.com'), ('pgtap-income-bob@example.com');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'alice_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-income-alice@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  (:'bob_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-income-bob@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now());

select household_id as alice_household from public.household_members where user_id = :'alice_id' \gset
select household_id as bob_household from public.household_members where user_id = :'bob_id' \gset

insert into public.horizon_accounts (household_id, name, currency, type)
  values (:'alice_household', 'Alice checking', 'RSD', 'personal')
  returning id as alice_account \gset

insert into public.horizon_income_streams
  (household_id, account_id, name, kind, currency, hourly_rate_minor, hours_per_day_e2, start_date)
  values (:'alice_household', :'alice_account', 'Alice freelance', 'hourly', 'RSD', 5000, 800, '2026-01-01');

-- ---------------------------------------------------------------------------
-- Field-presence check constraint (horizon_income_streams_hourly_fields).
-- ---------------------------------------------------------------------------

select throws_ok(
  format($$ insert into public.horizon_income_streams
            (household_id, account_id, name, kind, currency, start_date)
            values (%L, %L, 'Bad hourly', 'hourly', 'RSD', '2026-01-01') $$,
    :'alice_household', :'alice_account'),
  '23514', null,
  'an hourly stream without rate/hours violates the check constraint');

select throws_ok(
  format($$ insert into public.horizon_income_streams
            (household_id, account_id, name, kind, currency, fixed_amount_minor, hourly_rate_minor, start_date)
            values (%L, %L, 'Bad fixed', 'fixed', 'RSD', 100000, 5000, '2026-01-01') $$,
    :'alice_household', :'alice_account'),
  '23514', null,
  'a fixed stream carrying an hourly field also violates the check constraint');

-- ---------------------------------------------------------------------------
-- Alice logs in: sees and can write her own household's stream.
-- ---------------------------------------------------------------------------

select tests.login_as(:'alice_id');

select is(
  (select count(*)::int from public.horizon_income_streams where household_id = :'alice_household'),
  1, 'alice sees her own income stream');

select lives_ok(
  format($$ insert into public.horizon_income_streams
            (household_id, account_id, name, kind, currency, fixed_amount_minor, start_date)
            values (%L, %L, 'Alice retainer', 'fixed', 'EUR', 200000, '2026-01-01') $$,
    :'alice_household', :'alice_account'),
  'alice can insert an income stream into her own household');

-- ---------------------------------------------------------------------------
-- Bob logs in: alice's streams are invisible and unwritable.
-- ---------------------------------------------------------------------------

select tests.login_as(:'bob_id');

select is(
  (select count(*)::int from public.horizon_income_streams where household_id = :'alice_household'),
  0, 'bob sees zero income streams from alice''s household');

select throws_ok(
  format($$ insert into public.horizon_income_streams
            (household_id, account_id, name, kind, currency, fixed_amount_minor, start_date)
            values (%L, %L, 'Snooping', 'fixed', 'RSD', 1, '2026-01-01') $$,
    :'alice_household', :'alice_account'),
  '42501', null,
  'bob cannot insert an income stream into alice''s household');

with u as (
  update public.horizon_income_streams set archived = true where household_id = :'alice_household' returning 1
)
select is((select count(*)::int from u), 0, 'bob''s update of alice''s income streams touches zero rows');

with d as (
  delete from public.horizon_income_streams where household_id = :'alice_household' returning 1
)
select is((select count(*)::int from d), 0, 'bob''s delete of alice''s income streams touches zero rows');

select * from finish();
rollback;
