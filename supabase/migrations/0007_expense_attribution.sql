-- Attribution must not own the row.
--
-- 0001_phase1_init.sql:45 created expenses.user_id as ownership (`on delete
-- cascade`). 0003_households.sql re-keyed everything to household_id and
-- explicitly repurposed user_id as "added_by" attribution (0003:8, :128) but
-- never touched the FK. Deleting a departed member out of Supabase auth
-- therefore deletes every expense they ever logged out of the *shared*
-- household pool — the surviving member's history silently shrinks with no
-- error and no notice.
--
-- An expense belongs to the household; user_id only records who logged it.
-- Deleting a member must not rewrite shared history.

alter table public.expenses drop constraint expenses_user_id_fkey;
alter table public.expenses alter column user_id drop not null;
alter table public.expenses
  add constraint expenses_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Immutable attribution/scope columns.
--
-- expenses_update (0003:232) only re-checks household membership, not
-- user_id — so a co-member could PATCH PostgREST directly and re-attribute
-- any expense, or rewrite its currency. The product's real invariant is that
-- the pool stays shared (any member may edit any expense's amount/note/date/
-- category — that's the point), while who-logged-it, which-household, and
-- currency-stability are facts about the row that no UPDATE should be able
-- to change. That's a trigger, not a narrower policy: a `user_id =
-- auth.uid()` check on the policy (as originally proposed) would make it
-- impossible for one member to correct the other's entry, which breaks the
-- shared-pool premise the app is built on.
--
-- join_household() (0003 §9) legitimately moves household_id (and remaps
-- category_id) when a member merges into another household. It is SECURITY
-- DEFINER, but triggers still fire for definer functions, so it sets a
-- session-local bypass flag around that one UPDATE.
--
-- The `expenses_user_id_fkey ... on delete set null` above is the other
-- legitimate case: deleting a user fires an internal UPDATE ... SET user_id
-- = NULL on every expense they're attributed to, and that's a real UPDATE as
-- far as this trigger is concerned — it fires for FK-driven changes exactly
-- like a client-issued one. Rather than exempt it by flag (there's no
-- session to set one in, since it runs inside the DELETE's own machinery),
-- the immutability rule below only blocks changes that land on a *specific,
-- non-null* user_id. Setting user_id to NULL is always allowed — it's the
-- one transition every legitimate path (the FK action, delete_account())
-- needs — while re-attributing to a different real user, from any starting
-- value including NULL, stays blocked.

create or replace function public.expenses_freeze_columns()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.bypass_expense_freeze', true), 'off') = 'on' then
    return new;
  end if;
  if new.user_id is not null and new.user_id is distinct from old.user_id then
    raise exception 'user_id is immutable';
  end if;
  if new.household_id is distinct from old.household_id then
    raise exception 'household_id is immutable';
  end if;
  if new.currency is distinct from old.currency then
    raise exception 'currency is immutable';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_freeze on public.expenses;
create trigger expenses_freeze
  before update on public.expenses
  for each row execute function public.expenses_freeze_columns();

-- Re-declare join_household() with the freeze bypass around its household
-- merge UPDATE. Everything else is unchanged from 0003 §9.
create or replace function public.join_household(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me               uuid := auth.uid();
  target_household uuid;
  old_household    uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select household_id into target_household
    from public.household_invites
    where code = invite_code
      and (expires_at is null or expires_at > now());
  if target_household is null then
    raise exception 'Invalid or expired invite code';
  end if;

  select household_id into old_household
    from public.household_members where user_id = me;

  if old_household = target_household then
    return target_household;  -- already a member — no-op
  end if;

  -- Move my expenses into the target household, remapping each to a same-named
  -- category there (else NULL — the one v1 rough edge on category merge).
  perform set_config('app.bypass_expense_freeze', 'on', true);
  update public.expenses e
     set household_id = target_household,
         category_id  = (
           select t.id from public.categories t
           where t.household_id = target_household
             and t.name = (select c.name from public.categories c where c.id = e.category_id)
           limit 1
         )
   where e.household_id = old_household and e.user_id = me;
  perform set_config('app.bypass_expense_freeze', 'off', true);

  -- Move my membership (unique(user_id) keeps it one row).
  update public.household_members
     set household_id = target_household, role = 'member'
   where user_id = me;

  -- Drop my old household only if no one else remains in it (cascades its
  -- budget_settings + categories + invites). I adopt the target's cap.
  if not exists (select 1 from public.household_members where household_id = old_household) then
    delete from public.households where id = old_household;
  end if;

  return target_household;
end;
$$;

-- ---------------------------------------------------------------------------
-- Explicit account-deletion RPC. There is currently no in-app deletion path;
-- the only way to remove a user today is a manual dashboard operation on
-- auth.users, which now relies on the SET NULL above to anonymize rather
-- than delete their expenses. This RPC does the same anonymization
-- explicitly, so a future self-service "delete my account" feature has
-- something legible to call instead of relying on the FK's side effect.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  update public.expenses set user_id = null where user_id = me;
  delete from public.household_members where user_id = me;
  delete from public.profiles where id = me;
  -- auth.users deletion stays a deliberate admin step.
end;
$$;

grant execute on function public.delete_account() to authenticated;
