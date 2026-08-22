-- pgTAP RLS isolation suite for horizon_obligations (0020_horizon_obligations.sql).
-- Run with: supabase test db
--
-- Mirrors horizon_income_streams.sql's alice/bob shape.

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
  ('pgtap-obligation-alice@example.com'), ('pgtap-obligation-bob@example.com');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'alice_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-obligation-alice@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  (:'bob_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-obligation-bob@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now());

select household_id as alice_household from public.household_members where user_id = :'alice_id' \gset
select household_id as bob_household from public.household_members where user_id = :'bob_id' \gset

insert into public.horizon_accounts (household_id, name, currency, type)
  values (:'alice_household', 'Alice checking', 'RSD', 'personal')
  returning id as alice_account \gset

insert into public.horizon_obligations
  (household_id, account_id, name, category, amount_minor, currency, start_date)
  values (:'alice_household', :'alice_account', 'Alice rent', 'housing', 50000, 'RSD', '2026-01-01');

-- ---------------------------------------------------------------------------
-- Check constraints.
-- ---------------------------------------------------------------------------

select throws_ok(
  format($$ insert into public.horizon_obligations
            (household_id, account_id, name, category, amount_minor, currency, start_date)
            values (%L, %L, 'Bad category', 'not-a-category', 1000, 'RSD', '2026-01-01') $$,
    :'alice_household', :'alice_account'),
  '23514', null,
  'an unsupported category violates the check constraint');

select throws_ok(
  format($$ insert into public.horizon_obligations
            (household_id, account_id, name, category, amount_minor, currency, start_date, end_date)
            values (%L, %L, 'Backwards', 'housing', 1000, 'RSD', '2026-06-01', '2026-01-01') $$,
    :'alice_household', :'alice_account'),
  '23514', null,
  'an end date before the start date violates the check constraint');

-- ---------------------------------------------------------------------------
-- Alice logs in: sees and can write her own household's obligation.
-- ---------------------------------------------------------------------------

select tests.login_as(:'alice_id');

select is(
  (select count(*)::int from public.horizon_obligations where household_id = :'alice_household'),
  1, 'alice sees her own obligation');

select lives_ok(
  format($$ insert into public.horizon_obligations
            (household_id, account_id, name, category, amount_minor, currency, start_date)
            values (%L, %L, 'Alice utilities', 'utilities', 8000, 'EUR', '2026-01-01') $$,
    :'alice_household', :'alice_account'),
  'alice can insert an obligation into her own household');

-- ---------------------------------------------------------------------------
-- Bob logs in: alice's obligations are invisible and unwritable.
-- ---------------------------------------------------------------------------

select tests.login_as(:'bob_id');

select is(
  (select count(*)::int from public.horizon_obligations where household_id = :'alice_household'),
  0, 'bob sees zero obligations from alice''s household');

select throws_ok(
  format($$ insert into public.horizon_obligations
            (household_id, account_id, name, category, amount_minor, currency, start_date)
            values (%L, %L, 'Snooping', 'other', 1, 'RSD', '2026-01-01') $$,
    :'alice_household', :'alice_account'),
  '42501', null,
  'bob cannot insert an obligation into alice''s household');

with d as (
  delete from public.horizon_obligations where household_id = :'alice_household' returning 1
)
select is((select count(*)::int from d), 0, 'bob''s delete of alice''s obligations touches zero rows');

select * from finish();
rollback;
