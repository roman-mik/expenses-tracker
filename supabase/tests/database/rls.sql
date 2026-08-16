-- pgTAP RLS isolation suite (supabase/migrations/0003_households.sql:191-233).
-- Run with: supabase test db
--
-- join_household.sql tests join/merge mechanics; it never asserts that one
-- household is actually invisible to another. This file is the missing
-- assertion: rewrite any policy in 0003 to `using (true)` and this suite
-- must fail. (Verified manually while writing it — see REVIEW.md.)
--
-- Two users, alice and bob, each get their own household-of-one plus a
-- default expense/category/cap via handle_new_user(). Bob never joins
-- alice's household, so every read from alice's data while logged in as bob
-- must return zero rows, and every write must be rejected outright.

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

select plan(16);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

select gen_random_uuid() as alice_id \gset
select gen_random_uuid() as bob_id \gset

insert into public.allowed_emails (email) values
  ('pgtap-alice@example.com'), ('pgtap-bob@example.com');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'alice_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-alice@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  (:'bob_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-bob@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now());

-- Each user got a household-of-one, budget_settings, and 5 categories via
-- handle_new_user(). Give alice an expense to have something to leak.
select household_id as alice_household from public.household_members where user_id = :'alice_id' \gset
select household_id as bob_household from public.household_members where user_id = :'bob_id' \gset

insert into public.expenses (household_id, user_id, amount_minor, currency, note)
  values (:'alice_household', :'alice_id', 1500, 'RSD', 'alice groceries');

-- ---------------------------------------------------------------------------
-- Bob logs in. Nothing of alice's should be visible or writable.
-- ---------------------------------------------------------------------------

select tests.login_as(:'bob_id');

select is(
  (select count(*)::int from public.expenses where household_id = :'alice_household'),
  0, 'bob sees zero expenses from alice''s household');

select is(
  (select count(*)::int from public.categories where household_id = :'alice_household'),
  0, 'bob sees zero categories from alice''s household');

select is(
  (select count(*)::int from public.budget_settings where household_id = :'alice_household'),
  0, 'bob sees zero budget rows from alice''s household');

select is(
  (select count(*)::int from public.household_members where household_id = :'alice_household'),
  0, 'bob sees zero membership rows for alice''s household');

select is(
  (select count(*)::int from public.households where id = :'alice_household'),
  0, 'alice''s household row is hidden from bob');

select is(
  (select count(*)::int from public.profiles where id = :'alice_id'),
  0, 'alice''s profile is hidden from bob (not a co-member)');

insert into public.household_invites (code, household_id, created_by)
  select 'CCCCDDDD02', household_id, :'bob_id' from public.household_members where user_id = :'bob_id';

select is(
  (select count(*)::int from public.household_invites where household_id = :'alice_household'),
  0, 'alice''s invites are hidden from bob');

select throws_ok(
  format($$ insert into public.expenses (household_id, user_id, amount_minor, currency)
            values (%L, %L, 100, 'RSD') $$, :'alice_household', :'bob_id'),
  '42501', null,
  'bob cannot insert an expense into alice''s household');

-- A data-modifying CTE must be at the statement's top level, so `is()` (which
-- would otherwise need the UPDATE/DELETE nested inside its argument) is
-- called from the CTE's own SELECT instead of wrapping it.
with u as (
  update public.expenses set amount_minor = 1 where household_id = :'alice_household' returning 1
)
select is((select count(*)::int from u), 0, 'bob''s update of alice''s expenses touches zero rows');

with d as (
  delete from public.expenses where household_id = :'alice_household' returning 1
)
select is((select count(*)::int from d), 0, 'bob''s delete of alice''s expenses touches zero rows');

select throws_ok(
  format($$ insert into public.expenses (household_id, user_id, amount_minor, currency)
            values (%L, %L, 100, 'RSD') $$, :'bob_household', :'alice_id'),
  '42501', null,
  'bob cannot attribute an expense in his own household to alice (user_id must be auth.uid())');

select throws_ok(
  format($$ insert into public.household_members (household_id, user_id, role)
            values (%L, %L, 'member') $$, :'alice_household', :'bob_id'),
  '42501', null,
  'bob cannot self-insert into alice''s household_members (no insert policy on that table)');

select throws_ok(
  format($$ insert into public.categories (household_id, name, color, sort_order)
            values (%L, 'Snooping', 'sage-500', 9) $$, :'alice_household'),
  '42501', null,
  'bob cannot insert a category into alice''s household');

-- profiles_update's USING clause (id = auth.uid()) filters the target row out
-- before CHECK is ever evaluated, so this is a silent zero-row UPDATE, not a
-- thrown 42501 — same shape as the expenses update/delete checks above.
with p as (
  update public.profiles set display_name = 'pwned' where id = :'alice_id' returning 1
)
select is((select count(*)::int from p), 0, 'bob''s update of alice''s profile touches zero rows');

-- ---------------------------------------------------------------------------
-- Sanity: bob''s own data is unaffected by the isolation above.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.household_invites where code = 'CCCCDDDD02'),
  1, 'bob can still read the invite he just created in his own household');

select lives_ok(
  format($$ insert into public.expenses (household_id, user_id, amount_minor, currency)
            values (%L, %L, 200, 'RSD') $$, :'bob_household', :'bob_id'),
  'bob can insert an expense into his own household, attributed to himself');

select * from finish();
rollback;
