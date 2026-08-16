-- pgTAP tests for public.join_household(invite_code) (supabase/migrations
-- 0003_households.sql §9, hardened by 0008_invite_hardening.sql).
-- Run with: supabase test db
--
-- Strategy: create users directly via auth.users (bypassing the real signup
-- flow), which fires handle_new_user() and gives each their own
-- household-of-one with default categories. Impersonate a user for a
-- statement with tests.login_as(), which sets the `request.jwt.claims` GUC
-- that auth.uid() reads AND switches the session role to `authenticated`, so
-- every statement below is actually subject to RLS rather than running as
-- the BYPASSRLS superuser `supabase test db` connects as. tests.logout()
-- reverts to that superuser role for fixture setup that needs it.
--
-- Invite codes minted directly in fixtures must satisfy
-- household_invites_code_format (10 chars, Crockford base32 alphabet) —
-- unlike the old suite's free-text codes, which the 0008 CHECK now rejects.

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

select plan(20);

-- ---------------------------------------------------------------------------
-- Fixtures — random ids so this never collides with real dev data.
-- ---------------------------------------------------------------------------

select gen_random_uuid() as owner_id \gset
select gen_random_uuid() as joiner_id \gset
select gen_random_uuid() as third_id \gset
select gen_random_uuid() as multi_a_id \gset
select gen_random_uuid() as multi_b_id \gset
select gen_random_uuid() as eur_id \gset
select gen_random_uuid() as throttled_id \gset

-- Fixture setup stays as the unrestricted superuser role: auth.users rows and
-- allowed_emails inserts are not things a real client can do at all.
insert into public.allowed_emails (email) values
  ('pgtap-owner@example.com'), ('pgtap-joiner@example.com'), ('pgtap-third@example.com'),
  ('pgtap-multi-a@example.com'), ('pgtap-multi-b@example.com'),
  ('pgtap-eur@example.com'), ('pgtap-throttled@example.com');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'owner_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-owner@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  (:'joiner_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-joiner@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  (:'third_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-third@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  (:'multi_a_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-multi-a@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  (:'multi_b_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-multi-b@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  (:'eur_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-eur@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  (:'throttled_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-throttled@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now());

-- Each user got a household-of-one + 5 default categories via handle_new_user().

-- A third member joins the owner's household up front (using the owner's
-- first code), so later we can assert the owner's household survives (it
-- isn't left empty) when the joiner leaves it.
select tests.login_as(:'owner_id');

insert into public.household_invites (code, household_id, created_by)
  select 'AAAABBBB01', household_id, :'owner_id'
  from public.household_members where user_id = :'owner_id';

select tests.login_as(:'third_id');
select public.join_household('AAAABBBB01');

-- Give the joiner an expense in a category the owner's household also has by
-- name ("Groceries") and one in a category unique to the joiner ("Custom").
select tests.login_as(:'joiner_id');

insert into public.categories (household_id, name, color, sort_order)
  select household_id, 'Custom', 'accent-500', 5
  from public.household_members where user_id = :'joiner_id';

insert into public.expenses (household_id, user_id, category_id, amount_minor, currency, note)
  select household_id, :'joiner_id', id, 500, 'RSD', 'groceries expense'
  from public.categories
  where household_id = (select household_id from public.household_members where user_id = :'joiner_id')
    and name = 'Groceries';

insert into public.expenses (household_id, user_id, category_id, amount_minor, currency, note)
  select household_id, :'joiner_id', id, 700, 'RSD', 'custom expense'
  from public.categories
  where household_id = (select household_id from public.household_members where user_id = :'joiner_id')
    and name = 'Custom';

select household_id as joiner_old_household from public.household_members where user_id = :'joiner_id' \gset

-- A second, still-live code for the owner's household — used later for the
-- happy path (the first, AAAABBBB01, is already redeemed by third_id) and
-- for the idempotent-no-op-for-an-existing-member case.
select tests.login_as(:'owner_id');
insert into public.household_invites (code, household_id, created_by)
  select 'AAAABBBB02', household_id, :'owner_id'
  from public.household_members where user_id = :'owner_id';

-- ---------------------------------------------------------------------------
-- Error cases first (don't disturb fixtures below)
-- ---------------------------------------------------------------------------

select tests.logout();
select throws_like(
  $$ select public.join_household('AAAABBBB02') $$,
  '%Not authenticated%',
  'unauthenticated caller is rejected'
);

select tests.login_as(:'joiner_id');
select is(
  public.join_household('NOSUCHCODE'),
  null,
  'unknown invite code returns null rather than raising (so a throttle built on it still counts the attempt)'
);

-- Minted under eur_id's own household, not owner's — owner's household
-- already has a live code (AAAABBBB02) and uq_household_invites_live allows
-- only one unredeemed invite per household at a time.
select tests.login_as(:'eur_id');
insert into public.household_invites (code, household_id, created_by, expires_at)
  select 'AAAABBBB03', household_id, :'eur_id', now() - interval '1 day'
  from public.household_members where user_id = :'eur_id';
select tests.login_as(:'joiner_id');
select is(
  public.join_household('AAAABBBB03'),
  null,
  'expired invite code returns null'
);

select is(
  public.join_household('AAAABBBB01'),
  null,
  'an already-redeemed code returns null (single-use)'
);

-- ---------------------------------------------------------------------------
-- Guard: refuse when the caller's own household has other members.
-- ---------------------------------------------------------------------------

select tests.login_as(:'multi_a_id');
insert into public.household_invites (code, household_id, created_by)
  select 'AAAABBBB04', household_id, :'multi_a_id'
  from public.household_members where user_id = :'multi_a_id';
select tests.login_as(:'multi_b_id');
select public.join_household('AAAABBBB04');
-- multi_a's household now has two members (multi_a, multi_b).

select tests.login_as(:'multi_a_id');
select throws_like(
  $$ select public.join_household('AAAABBBB02') $$,
  '%other members%',
  'a caller whose own household has other members cannot merge into a different one'
);

select is(
  (select count(*)::int from public.household_members where user_id = :'multi_a_id'
     and household_id in (select household_id from public.household_members where user_id = :'multi_b_id')),
  1,
  'the multi-member household is untouched by the rejected attempt'
);

-- ---------------------------------------------------------------------------
-- Guard: refuse a cross-currency merge.
-- ---------------------------------------------------------------------------

select tests.logout();
update public.households set currency = 'EUR'
  where id = (select household_id from public.household_members where user_id = :'eur_id');

select tests.login_as(:'eur_id');
select throws_like(
  $$ select public.join_household('AAAABBBB02') $$,
  '%different currencies%',
  'a cross-currency merge is refused'
);

-- ---------------------------------------------------------------------------
-- Guard: throttle at 10 attempts/hour.
-- ---------------------------------------------------------------------------

select tests.logout();
insert into public.join_attempts (user_id, attempted_at)
  select :'throttled_id', now() - (n || ' minutes')::interval
  from generate_series(1, 10) as n;

select tests.login_as(:'throttled_id');
select throws_like(
  $$ select public.join_household('AAAABBBB02') $$,
  '%Too many attempts%',
  '11th attempt within an hour is throttled, even with a valid code'
);

-- ---------------------------------------------------------------------------
-- Happy path: joiner merges into the owner's household (via the second code
-- — the first was consumed by third_id above).
-- ---------------------------------------------------------------------------

select tests.login_as(:'joiner_id');

select lives_ok(
  $$ select public.join_household('AAAABBBB02') $$,
  'join_household succeeds for a valid, unexpired, unredeemed code'
);

select results_eq(
  format($$ select household_id, role from public.household_members where user_id = %L $$, :'joiner_id'),
  format($$ select household_id, 'member'::text from public.household_members where user_id = %L $$, :'owner_id'),
  'joiner''s membership moves to the target household with role member'
);

select results_eq(
  format($$
    select e.amount_minor, c.name
    from public.expenses e join public.categories c on c.id = e.category_id
    where e.user_id = %L and e.note = 'groceries expense'
  $$, :'joiner_id'),
  $$ values (500::bigint, 'Groceries'::text) $$,
  'expense in a same-named category is remapped to the target household''s matching category'
);

select is(
  (select category_id from public.expenses where user_id = :'joiner_id' and note = 'custom expense'),
  null,
  'expense in a category with no same-named match in the target lands with a NULL category'
);

select results_eq(
  format($$ select distinct household_id from public.expenses where user_id = %L $$, :'joiner_id'),
  format($$ select household_id from public.household_members where user_id = %L $$, :'owner_id'),
  'all of the joiner''s expenses move to the target household'
);

-- These two are absence checks: once the joiner leaves joiner_old_household,
-- RLS would hide any surviving row from them regardless of whether it was
-- actually deleted. Verify as the unrestricted superuser so a "0 rows" result
-- means the row is gone, not merely invisible to this caller.
select tests.logout();

select is(
  (select count(*)::int from public.households where id = :'joiner_old_household'),
  0,
  'the joiner''s old (now-empty) household is deleted'
);

select is(
  (select count(*)::int from public.categories where household_id = :'joiner_old_household'),
  0,
  'the deleted household''s categories are gone (cascade)'
);

select is(
  (select redeemed_at is not null from public.household_invites where code = 'AAAABBBB02'),
  true,
  'the redeemed code is marked redeemed_at, so it cannot be used again'
);

select tests.login_as(:'joiner_id');

-- Owner's household must survive — the third user is still in it. The joiner
-- is now a member of that same household too, so this is a real RLS-visible
-- read, not a privileged one.
select is(
  (select count(*)::int from public.household_members where user_id = :'owner_id'),
  1,
  'the target household (still populated by the third member) is untouched'
);

-- A now-redeemed code is single-use: submitting it again (even by a member of
-- the household it pointed to) returns null rather than a "no-op" success.
select is(
  public.join_household('AAAABBBB02'),
  null,
  'resubmitting an already-redeemed code fails — single-use, no idempotent re-join via the same code'
);

-- The idempotent no-op still exists for a genuinely live code: mint a THIRD
-- code for the same (owner's) household and have an existing member (third,
-- who joined earlier) redeem it — should succeed as a no-op and leave the
-- code unredeemed, since a member re-submitting a valid code shouldn't burn it.
select tests.login_as(:'owner_id');
insert into public.household_invites (code, household_id, created_by)
  select 'AAAABBBB05', household_id, :'owner_id'
  from public.household_members where user_id = :'owner_id';

select tests.login_as(:'third_id');
select lives_ok(
  $$ select public.join_household('AAAABBBB05') $$,
  'an existing member redeeming a still-live code for their own household is a no-op, not an error'
);

select tests.logout();
select is(
  (select redeemed_at from public.household_invites where code = 'AAAABBBB05'),
  null,
  'the no-op path does not consume the code — it never got past the "already a member" check'
);

select * from finish();
rollback;
