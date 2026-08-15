-- pgTAP tests for expense attribution (supabase/migrations/0007_expense_attribution.sql).
-- Run with: supabase test db
--
-- Two things to verify: (1) deleting a user out of auth.users anonymizes
-- their expenses instead of deleting them out of the shared pool, and (2) no
-- UPDATE — from any member, including the row's own attributed user — can
-- change user_id, household_id, currency, or created_at.

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

select plan(9);

-- ---------------------------------------------------------------------------
-- Fixtures — alice and bob share alice's household.
-- ---------------------------------------------------------------------------

select gen_random_uuid() as alice_id \gset
select gen_random_uuid() as bob_id \gset

insert into public.allowed_emails (email) values
  ('pgtap-attr-alice@example.com'), ('pgtap-attr-bob@example.com');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'alice_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-attr-alice@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  (:'bob_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-attr-bob@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now());

select household_id as household from public.household_members where user_id = :'alice_id' \gset

insert into public.household_invites (code, household_id, created_by)
  values ('ATTR-CODE', :'household'::uuid, :'alice_id');

select tests.login_as(:'bob_id');
select public.join_household('ATTR-CODE');
select tests.logout();

insert into public.expenses (household_id, user_id, amount_minor, currency, note)
  values (:'household'::uuid, :'alice_id', 900, 'RSD', 'attribution fixture')
  returning id as expense_id \gset

-- ---------------------------------------------------------------------------
-- Immutability trigger — bob (a co-member) tries to rewrite scope columns.
-- ---------------------------------------------------------------------------

select tests.login_as(:'bob_id');

select throws_like(
  format($$ update public.expenses set user_id = %L where id = %L $$, :'bob_id', :'expense_id'),
  '%user_id is immutable%',
  'a co-member cannot re-attribute an expense''s user_id');

select throws_like(
  format($$ update public.expenses set currency = 'EUR' where id = %L $$, :'expense_id'),
  '%currency is immutable%',
  'a co-member cannot rewrite an expense''s currency');

select throws_like(
  format($$ update public.expenses set household_id = gen_random_uuid() where id = %L $$, :'expense_id'),
  '%household_id is immutable%',
  'a co-member cannot move an expense to an arbitrary household');

-- Editing the shared, mutable fields must still work — the whole point of
-- the trigger over a narrower policy is that the pool stays editable.
select lives_ok(
  format($$ update public.expenses set amount_minor = 950, note = 'corrected' where id = %L $$, :'expense_id'),
  'a co-member can still edit amount/note on a shared expense');

select tests.logout();

-- ---------------------------------------------------------------------------
-- Deleting the attributed user anonymizes, not deletes, their expenses.
-- ---------------------------------------------------------------------------

delete from auth.users where id = :'alice_id';

select is(
  (select count(*)::int from public.expenses where id = :'expense_id'),
  1, 'the expense survives its attributed user''s deletion');

select is(
  (select user_id from public.expenses where id = :'expense_id'),
  null, 'the surviving expense''s user_id is anonymized to NULL');

select is(
  (select household_id from public.expenses where id = :'expense_id'),
  :'household'::uuid, 'the expense stays in the shared household pool');

-- profiles/household_members still cascade-delete correctly (unchanged from
-- before this migration — only expenses.user_id semantics changed).
select is(
  (select count(*)::int from public.household_members where user_id = :'alice_id'),
  0, 'the deleted user''s household_members row is gone (still cascade)');

select is(
  (select count(*)::int from public.profiles where id = :'alice_id'),
  0, 'the deleted user''s profile row is gone (still cascade)');

select * from finish();
rollback;
