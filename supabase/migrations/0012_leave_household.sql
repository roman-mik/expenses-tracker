-- leave_household() — fork the shared history, don't split it.
--
-- There is currently no supported way to leave a shared household:
-- household_members has unique(user_id), the only insert/update path is the
-- SECURITY DEFINER trigger / join_household() RPC, and there is no
-- leave_household anywhere. Two people who separate cannot separate their
-- data (review-operability.md B2).
--
-- Product decision (REVIEW.md P2 item 22): both keep a full copy. A shared
-- cap is a household fact — "we spent 84k in March" is only true over the
-- union — so any split that removes rows makes both copies retroactively
-- false. Duplication is the only option that preserves truth on both sides.
-- Divergence after the fork is intended, not a bug: nobody's past months
-- change, and the two households are independent from this point on.
--
-- Guard: refuse when the caller is the household's only member — there is
-- nothing to leave (join_household's KAPA2 guard is the mirror case: it
-- refuses when the *joiner's* household has other members, since a merge
-- would silently strand them; this refuses the opposite situation).
--
-- Both create_household branches (categories, expenses) are INSERTs into
-- brand-new rows, so neither expenses_freeze (BEFORE UPDATE only) nor its
-- session-local bypass flag applies here — unlike join_household(), which
-- UPDATEs existing expense rows in place. expenses_stamp_currency (BEFORE
-- INSERT, 0009) does fire, but the new household's currency is a direct
-- copy of the old one, so it's a no-op stamp.

create or replace function public.leave_household()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me            uuid := auth.uid();
  old_household uuid;
  new_household uuid;
  member_count  int;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select household_id into old_household
    from public.household_members where user_id = me;
  if old_household is null then
    raise exception 'Not in a household';
  end if;

  select count(*) into member_count
    from public.household_members where household_id = old_household;
  if member_count <= 1 then
    raise exception 'You are the only member of this household — nothing to leave' using errcode = 'KAPA4';
  end if;

  -- The new home: same currency/timezone, fresh id.
  insert into public.households (currency, timezone)
    select currency, timezone from public.households where id = old_household
    returning id into new_household;

  -- Clone categories 1:1, tracking old id -> new id so expenses below can
  -- follow their category across the fork (a name-match, like
  -- join_household's cross-household merge, would be ambiguous here since
  -- these are literal duplicates of the source, not a merge into an
  -- existing distinct set).
  create temporary table if not exists tmp_leave_category_map (
    old_id uuid primary key,
    new_id uuid not null
  ) on commit drop;
  delete from tmp_leave_category_map;

  insert into tmp_leave_category_map (old_id, new_id)
    select id, gen_random_uuid() from public.categories where household_id = old_household;

  insert into public.categories (id, household_id, name, color, sort_order, archived)
    select m.new_id, new_household, c.name, c.color, c.sort_order, c.archived
    from public.categories c
    join tmp_leave_category_map m on m.old_id = c.id;

  -- The cap and nudge settings carry over unchanged.
  insert into public.budget_settings (household_id, monthly_cap, nudge_enabled, nudge_pct)
    select new_household, monthly_cap, nudge_enabled, nudge_pct
    from public.budget_settings where household_id = old_household;

  -- Every expense in the shared pool is copied — attribution (user_id)
  -- preserved, including co-members' expenses. This is the fork: both
  -- households end up with the full shared history up to this point.
  insert into public.expenses (household_id, user_id, category_id, amount_minor, currency, note, spent_at)
    select new_household, e.user_id, m.new_id, e.amount_minor, e.currency, e.note, e.spent_at
    from public.expenses e
    left join tmp_leave_category_map m on m.old_id = e.category_id
    where e.household_id = old_household;

  -- Move my membership to the new household (unique(user_id) keeps it one
  -- row); I'm its sole member, so I'm its owner.
  update public.household_members
     set household_id = new_household, role = 'owner'
   where user_id = me;

  return new_household;
end;
$$;

grant execute on function public.leave_household() to authenticated;
