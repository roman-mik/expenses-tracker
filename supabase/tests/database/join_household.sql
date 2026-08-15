-- pgTAP tests for public.join_household(invite_code) (supabase/migrations/0003_households.sql §9).
-- Run with: supabase test db
--
-- Strategy: create three users directly via auth.users (bypassing the real
-- signup flow), which fires handle_new_user() and gives each their own
-- household-of-one with default categories. Impersonate a user for a
-- statement by setting the `request.jwt.claims` GUC that auth.uid() reads.

begin;
select plan(13);

-- ---------------------------------------------------------------------------
-- Fixtures — random ids so this never collides with real dev data.
-- ---------------------------------------------------------------------------

select gen_random_uuid() as owner_id \gset
select gen_random_uuid() as joiner_id \gset
select gen_random_uuid() as third_id \gset

insert into public.allowed_emails (email) values
  ('pgtap-owner@example.com'), ('pgtap-joiner@example.com'), ('pgtap-third@example.com');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'owner_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-owner@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  (:'joiner_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-joiner@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  (:'third_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-third@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now());

-- Each user got a household-of-one + 5 default categories via handle_new_user().

-- A third member joins the owner's household up front, so later we can assert
-- the owner's household survives (it isn't left empty) when the joiner leaves it.
select set_config('request.jwt.claims', json_build_object('sub', :'owner_id')::text, true);
select set_config('request.jwt.claim.sub', :'owner_id', true);

insert into public.household_invites (code, household_id, created_by)
  select 'OWNER-CODE-' || :'owner_id', household_id, :'owner_id'
  from public.household_members where user_id = :'owner_id';

select ('OWNER-CODE-' || :'owner_id') as owner_code \gset

select set_config('request.jwt.claims', json_build_object('sub', :'third_id')::text, true);
select set_config('request.jwt.claim.sub', :'third_id', true);

select public.join_household(:'owner_code');

-- Give the joiner an expense in a category the owner's household also has by
-- name ("Groceries") and one in a category unique to the joiner ("Custom").
select set_config('request.jwt.claims', json_build_object('sub', :'joiner_id')::text, true);
select set_config('request.jwt.claim.sub', :'joiner_id', true);

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

-- ---------------------------------------------------------------------------
-- Error cases first (don't disturb fixtures below)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);
select throws_like(
  format($$ select public.join_household(%L) $$, :'owner_code'),
  '%Not authenticated%',
  'unauthenticated caller is rejected'
);

select set_config('request.jwt.claims', json_build_object('sub', :'joiner_id')::text, true);
select set_config('request.jwt.claim.sub', :'joiner_id', true);
select throws_like(
  $$ select public.join_household('NO-SUCH-CODE') $$,
  '%Invalid or expired invite code%',
  'unknown invite code is rejected'
);

insert into public.household_invites (code, household_id, created_by, expires_at)
  select 'EXPIRED-CODE-' || :'owner_id', household_id, :'owner_id', now() - interval '1 day'
  from public.household_members where user_id = :'owner_id';
select throws_like(
  format($$ select public.join_household(%L) $$, 'EXPIRED-CODE-' || :'owner_id'),
  '%Invalid or expired invite code%',
  'expired invite code is rejected'
);

-- ---------------------------------------------------------------------------
-- Happy path: joiner merges into the owner's household.
-- ---------------------------------------------------------------------------

select lives_ok(
  format($$ select public.join_household(%L) $$, :'owner_code'),
  'join_household succeeds for a valid, unexpired code'
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

-- Owner's household must survive — the third user is still in it.
select is(
  (select count(*)::int from public.household_members where user_id = :'owner_id'),
  1,
  'the target household (still populated by the third member) is untouched'
);

-- Re-joining the same household is a no-op, not an error.
select lives_ok(
  format($$ select public.join_household(%L) $$, :'owner_code'),
  'joining a household the caller already belongs to is a no-op'
);

select results_eq(
  format($$ select household_id from public.household_members where user_id = %L $$, :'joiner_id'),
  format($$ select household_id from public.household_members where user_id = %L $$, :'owner_id'),
  'no-op re-join leaves the joiner in the same (target) household'
);

select * from finish();
rollback;
