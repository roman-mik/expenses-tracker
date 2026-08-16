-- Invite codes are permanent, unlimited-use bearer tokens with an
-- unthrottled guessing oracle (review-security.md "Invite codes..."), and
-- join_household() will silently strip expenses out of a multi-member
-- source household or merge across currencies (review-database.md,
-- review-security.md). All three fixes belong in the RPC, not in src/ — a
-- co-member can call POST /rest/v1/rpc/join_household directly with their
-- own JWT, so an app-layer limiter on /api/household/join binds nothing.

-- ---------------------------------------------------------------------------
-- 1. Schema: expiry default, single-use, and a wider code format.
-- ---------------------------------------------------------------------------

-- Invites are short-lived, single-use bearer tokens — any row already in the
-- table predates this format (e.g. the old 8-char code scheme) and is safe
-- to drop; the household just re-mints a fresh code on next invite.
delete from public.household_invites where code !~ '^[0-9A-HJKMNP-TV-Z]{10}$';

alter table public.household_invites
  alter column expires_at set default now() + interval '24 hours',
  add column if not exists redeemed_at timestamptz,
  add constraint household_invites_code_format check (code ~ '^[0-9A-HJKMNP-TV-Z]{10}$');

-- "One active code per household" was previously an app-layer convention
-- (createInvite deletes prior codes before inserting) that a direct
-- PostgREST insert could bypass — invites_insert (0003) permits it. Enforce
-- it in the schema: at most one *unredeemed* invite per household.
create unique index if not exists uq_household_invites_live
  on public.household_invites (household_id) where redeemed_at is null;

-- ---------------------------------------------------------------------------
-- 2. Join-attempt log — the throttle's ledger. RLS enabled with no policies:
--    this table is only ever touched by the SECURITY DEFINER RPC below,
--    which runs as the function owner and bypasses RLS regardless, so no
--    grants are needed for anon/authenticated either.
-- ---------------------------------------------------------------------------

create table if not exists public.join_attempts (
  user_id      uuid        not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists idx_join_attempts_user on public.join_attempts (user_id, attempted_at desc);
alter table public.join_attempts enable row level security;

-- ---------------------------------------------------------------------------
-- 3. join_household(code) rewrite.
--
--    Throttle: at most 10 attempts per caller per rolling hour. The attempt
--    row is inserted BEFORE the code is validated, and an invalid/expired/
--    already-redeemed code returns NULL rather than raising — a `raise`
--    aborts the whole function call and rolls back everything it did in this
--    transaction, INCLUDING that just-inserted attempt row, which would make
--    the throttle count nothing on exactly the guesses it exists to catch.
--    Genuine faults (not authenticated, too many attempts, the two new
--    correctness guards below) still `raise`, each with a stable SQLSTATE so
--    the app can map it to translated copy instead of showing raw SQL text.
--
--    New correctness guards, both from the domain-math/database review:
--      - refuse when the caller's OWN household has other members — the
--        existing merge only moves the caller's own expenses, silently
--        splitting a shared pool it leaves behind.
--      - refuse a cross-currency merge outright — merged rows would keep
--        their original currency and silently drop out of getSummary's cap
--        math (RSD-only stays the v1 stance; PLAN.md's currency work is
--        list-only for now).
--
--    Trade-off, deliberate: because codes are now single-use, resubmitting a
--    code you already redeemed no longer succeeds as a no-op — the code
--    itself is gone. That's the correct read of "single-use," not a bug.
-- ---------------------------------------------------------------------------

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
  old_currency     char(3);
  target_currency  char(3);
  recent_attempts  int;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select count(*) into recent_attempts
    from public.join_attempts
   where user_id = me and attempted_at > now() - interval '1 hour';
  if recent_attempts >= 10 then
    raise exception 'Too many attempts — try again later' using errcode = 'KAPA1';
  end if;

  insert into public.join_attempts (user_id) values (me);

  select household_id into target_household
    from public.household_invites
    where code = invite_code
      and redeemed_at is null
      and (expires_at is null or expires_at > now())
    for update;

  if target_household is null then
    return null;  -- invalid, expired, or already-redeemed code
  end if;

  select household_id into old_household
    from public.household_members where user_id = me;

  if old_household = target_household then
    return target_household;  -- already a member — no-op
  end if;

  if (select count(*) from public.household_members where household_id = old_household) > 1 then
    raise exception 'Your household has other members — leave or move them first' using errcode = 'KAPA2';
  end if;

  select currency into old_currency    from public.households where id = old_household;
  select currency into target_currency from public.households where id = target_household;
  if old_currency is distinct from target_currency then
    raise exception 'Households use different currencies' using errcode = 'KAPA3';
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

  update public.household_invites set redeemed_at = now() where code = invite_code;

  return target_household;
end;
$$;
