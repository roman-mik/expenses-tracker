-- pgTAP tests for public.leave_household() (supabase/migrations/
-- 0012_leave_household.sql).
-- Run with: supabase test db
--
-- Same strategy as join_household.sql: real auth.users rows (each gets a
-- household-of-one + 5 default categories via handle_new_user()),
-- impersonated via tests.login_as()/tests.logout() so every statement is
-- actually subject to RLS, not run as the BYPASSRLS superuser
-- `supabase test db` connects as.

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

select plan(15);

-- ---------------------------------------------------------------------------
-- Fixtures — alice and bob share a household; solo_id is used for the
-- "nothing to leave" guard.
-- ---------------------------------------------------------------------------

select gen_random_uuid() as alice_id \gset
select gen_random_uuid() as bob_id \gset
select gen_random_uuid() as solo_id \gset

insert into public.allowed_emails (email) values
  ('pgtap-leave-alice@example.com'), ('pgtap-leave-bob@example.com'),
  ('pgtap-leave-solo@example.com');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'alice_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-leave-alice@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  (:'bob_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-leave-bob@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  (:'solo_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-leave-solo@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now());

select household_id as alice_household from public.household_members where user_id = :'alice_id' \gset

insert into public.household_invites (code, household_id, created_by)
  values ('DDDDEEEE01', :'alice_household'::uuid, :'alice_id');

select tests.login_as(:'bob_id');
select public.join_household('DDDDEEEE01');
select tests.logout();

-- A cap, and one expense each from alice and bob, in a category that exists
-- (the shared "Groceries" default) — this is what "both keep a full copy"
-- has to preserve.
update public.budget_settings set monthly_cap = 80000 where household_id = :'alice_household'::uuid;

select id as groceries_id from public.categories
  where household_id = :'alice_household'::uuid and name = 'Groceries' \gset

insert into public.expenses (household_id, user_id, category_id, amount_minor, currency, note)
  values
    (:'alice_household'::uuid, :'alice_id', :'groceries_id'::uuid, 1000, 'RSD', 'alice groceries'),
    (:'alice_household'::uuid, :'bob_id',   :'groceries_id'::uuid, 500,  'RSD', 'bob groceries'),
    (:'alice_household'::uuid, :'bob_id',   null,                  200,  'RSD', 'bob uncategorized');

-- ---------------------------------------------------------------------------
-- Guard: the only member of a household has nothing to leave.
-- ---------------------------------------------------------------------------

select tests.login_as(:'solo_id');
select throws_like(
  $$ select public.leave_household() $$,
  '%nothing to leave%',
  'the sole member of a household cannot leave it'
);
select tests.logout();

-- ---------------------------------------------------------------------------
-- Happy path: bob leaves alice's household.
-- ---------------------------------------------------------------------------

select tests.login_as(:'bob_id');
select public.leave_household() as bob_new_household \gset
select tests.logout();

select isnt(
  :'bob_new_household'::uuid, :'alice_household'::uuid,
  'leave_household returns a brand-new household id, not the old one'
);

select is(
  (select household_id from public.household_members where user_id = :'bob_id'),
  :'bob_new_household'::uuid,
  'bob''s membership moved to the new household'
);

select is(
  (select role from public.household_members where user_id = :'bob_id'),
  'owner',
  'bob is the owner of his new solo household'
);

select is(
  (select count(*)::int from public.household_members where household_id = :'alice_household'::uuid),
  1,
  'alice''s household has exactly one member left (alice) — bob is gone from it'
);

select is(
  (select monthly_cap from public.budget_settings where household_id = :'bob_new_household'::uuid),
  80000::bigint,
  'the cap carries over to the new household'
);

-- Every expense that existed in the shared pool is copied — including
-- alice's, not just bob's own. This is the "fork" contract: both households
-- end up with the identical shared history up to this point.
select is(
  (select count(*)::int from public.expenses where household_id = :'bob_new_household'::uuid),
  3,
  'all three expenses (alice''s and bob''s) are copied into the new household'
);

select is(
  (select sum(amount_minor)::bigint from public.expenses where household_id = :'bob_new_household'::uuid),
  (select sum(amount_minor)::bigint from public.expenses where household_id = :'alice_household'::uuid),
  'the new household''s total matches the old household''s total — nobody''s history shrank'
);

-- Categories were cloned (new ids), and expenses in the fork point at the
-- clones, not the originals.
select isnt(
  (select category_id from public.expenses
     where household_id = :'bob_new_household'::uuid and note = 'bob groceries'),
  :'groceries_id'::uuid,
  'the copied expense points at a cloned category, not the original household''s row'
);

select is(
  (select c.name from public.expenses e join public.categories c on c.id = e.category_id
     where e.household_id = :'bob_new_household'::uuid and e.note = 'bob groceries'),
  'Groceries',
  'the cloned category has the same name as the original'
);

select is(
  (select category_id from public.expenses
     where household_id = :'bob_new_household'::uuid and note = 'bob uncategorized'),
  null,
  'an uncategorized expense stays uncategorized in the fork'
);

-- The old household is untouched: same rows, same category ids, nothing
-- deleted or reattributed.
select is(
  (select count(*)::int from public.expenses where household_id = :'alice_household'::uuid),
  3,
  'alice''s household keeps all three original expenses — the fork does not remove anything'
);

select is(
  (select category_id from public.expenses
     where household_id = :'alice_household'::uuid and note = 'alice groceries'),
  :'groceries_id'::uuid,
  'the original household''s expenses still point at the original category'
);

-- ---------------------------------------------------------------------------
-- Post-fork isolation: each side only sees its own household now.
-- ---------------------------------------------------------------------------

select tests.login_as(:'alice_id');
select is(
  (select count(*)::int from public.expenses where household_id = :'bob_new_household'::uuid),
  0,
  'alice cannot see bob''s new (forked) household — RLS, not just app-layer scoping'
);
select tests.logout();

select tests.login_as(:'bob_id');
select is(
  (select count(*)::int from public.expenses where household_id = :'alice_household'::uuid),
  0,
  'bob can no longer see alice''s household after leaving it'
);
select tests.logout();

select * from finish();
rollback;
