-- pgTAP RLS isolation suite for ledger_accounts (0014_ledger_accounts.sql).
-- Run with: supabase test db
--
-- Mirrors rls.sql's alice/bob shape: a member reads/writes their own
-- household's accounts; a non-member reads zero rows and cannot insert.

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
  ('pgtap-ledger-alice@example.com'), ('pgtap-ledger-bob@example.com');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'alice_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-ledger-alice@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  (:'bob_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-ledger-bob@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now());

select household_id as alice_household from public.household_members where user_id = :'alice_id' \gset
select household_id as bob_household from public.household_members where user_id = :'bob_id' \gset

insert into public.ledger_accounts (household_id, name, currency, type)
  values (:'alice_household', 'Alice checking', 'RSD', 'personal');

-- ---------------------------------------------------------------------------
-- Alice logs in: sees and can write her own household's account.
-- ---------------------------------------------------------------------------

select tests.login_as(:'alice_id');

select is(
  (select count(*)::int from public.ledger_accounts where household_id = :'alice_household'),
  1, 'alice sees her own ledger account');

select lives_ok(
  format($$ insert into public.ledger_accounts (household_id, name, currency, type)
            values (%L, 'Alice savings', 'EUR', 'savings') $$, :'alice_household'),
  'alice can insert a ledger account into her own household');

-- ---------------------------------------------------------------------------
-- Bob logs in: alice's accounts are invisible and unwritable.
-- ---------------------------------------------------------------------------

select tests.login_as(:'bob_id');

select is(
  (select count(*)::int from public.ledger_accounts where household_id = :'alice_household'),
  0, 'bob sees zero ledger accounts from alice''s household');

select throws_ok(
  format($$ insert into public.ledger_accounts (household_id, name, currency, type)
            values (%L, 'Snooping', 'RSD', 'personal') $$, :'alice_household'),
  '42501', null,
  'bob cannot insert a ledger account into alice''s household');

with u as (
  update public.ledger_accounts set current_balance_minor = 1 where household_id = :'alice_household' returning 1
)
select is((select count(*)::int from u), 0, 'bob''s update of alice''s ledger accounts touches zero rows');

with d as (
  delete from public.ledger_accounts where household_id = :'alice_household' returning 1
)
select is((select count(*)::int from d), 0, 'bob''s delete of alice''s ledger accounts touches zero rows');

select lives_ok(
  format($$ insert into public.ledger_accounts (household_id, name, currency, type)
            values (%L, 'Bob checking', 'RSD', 'personal') $$, :'bob_household'),
  'bob can insert a ledger account into his own household');

select * from finish();
rollback;
