-- pgTAP RLS isolation suite for horizon_balance_snapshots (0016_ledger_balance_snapshots.sql).
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
  ('pgtap-snap-alice@example.com'), ('pgtap-snap-bob@example.com');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'alice_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-snap-alice@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  (:'bob_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-snap-bob@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now());

select household_id as alice_household from public.household_members where user_id = :'alice_id' \gset
select household_id as bob_household from public.household_members where user_id = :'bob_id' \gset

insert into public.horizon_accounts (id, household_id, name, currency, type)
  values ('00000000-0000-0000-0000-0000000000a1', :'alice_household', 'Alice checking', 'RSD', 'personal') \gset

insert into public.horizon_balance_snapshots (household_id, account_id, balance_minor, expected_minor, currency)
  values (:'alice_household', '00000000-0000-0000-0000-0000000000a1', 1000, 800, 'RSD');

-- ---------------------------------------------------------------------------
-- Alice logs in: sees and can write her own household's balance snapshots.
-- ---------------------------------------------------------------------------

select tests.login_as(:'alice_id');

select is(
  (select count(*)::int from public.horizon_balance_snapshots where household_id = :'alice_household'),
  1, 'alice sees her own balance snapshot');

select lives_ok(
  format($$ insert into public.horizon_balance_snapshots (household_id, account_id, balance_minor, expected_minor, currency)
            values (%L, '00000000-0000-0000-0000-0000000000a1', 1200, 1000, 'RSD') $$, :'alice_household'),
  'alice can insert a balance snapshot into her own household');

-- ---------------------------------------------------------------------------
-- Bob logs in: alice's balance snapshots are invisible and unwritable.
-- ---------------------------------------------------------------------------

select tests.login_as(:'bob_id');

select is(
  (select count(*)::int from public.horizon_balance_snapshots where household_id = :'alice_household'),
  0, 'bob sees zero balance snapshots from alice''s household');

select throws_ok(
  format($$ insert into public.horizon_balance_snapshots (household_id, account_id, balance_minor, expected_minor, currency)
            values (%L, '00000000-0000-0000-0000-0000000000a1', 5000, 0, 'RSD') $$, :'alice_household'),
  '42501', null,
  'bob cannot insert a balance snapshot into alice''s household');

with u as (
  update public.horizon_balance_snapshots set balance_minor = 1 where household_id = :'alice_household' returning 1
)
select is((select count(*)::int from u), 0, 'bob''s update of alice''s balance snapshots touches zero rows');

with d as (
  delete from public.horizon_balance_snapshots where household_id = :'alice_household' returning 1
)
select is((select count(*)::int from d), 0, 'bob''s delete of alice''s balance snapshots touches zero rows');

select lives_ok(
  format($$ insert into public.horizon_accounts (id, household_id, name, currency, type)
            values ('00000000-0000-0000-0000-0000000000b1', %L, 'Bob checking', 'RSD', 'personal');
            insert into public.horizon_balance_snapshots (household_id, account_id, balance_minor, expected_minor, currency)
            values (%L, '00000000-0000-0000-0000-0000000000b1', 500, 500, 'RSD'); $$, :'bob_household', :'bob_household'),
  'bob can insert a balance snapshot into his own household');

select * from finish();
rollback;
