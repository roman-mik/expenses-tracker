-- Kapa — Phase 3: shared cap via HOUSEHOLDS.
--
-- The household becomes the universal unit of ownership. A solo user is just a
-- household of one, so solo and shared budgets share one code path. This
-- migration:
--   * adds households / household_members / household_invites,
--   * re-keys budget_settings + categories from user_id -> household_id,
--   * adds household_id to expenses (user_id stays as *added_by* attribution),
--   * moves currency + timezone from profiles onto households (the cap's currency),
--   * replaces per-user RLS with membership RLS via SECURITY DEFINER helpers
--     (a naive membership subquery in a policy recurses — the helpers bypass RLS),
--   * rewrites new-user seeding + backfills a household-of-one for every existing
--     user (carrying their cap, categories and expenses across),
--   * adds a join_household(code) RPC that merges a joiner's data into a partner's
--     household transactionally.
--
-- Idempotent where practical (create ... if not exists, add column if not exists).

-- ---------------------------------------------------------------------------
-- 1. New tables
-- ---------------------------------------------------------------------------

create table if not exists public.households (
  id         uuid primary key default gen_random_uuid(),
  currency   char(3)     not null default 'RSD',   -- moved from profiles; the cap's currency
  timezone   text        not null default 'Europe/Belgrade', -- month boundaries
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid        not null references public.households (id) on delete cascade,
  user_id      uuid        not null references auth.users (id)       on delete cascade,
  role         text        not null default 'member',  -- 'owner' | 'member'
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)   -- one household per user for v1; drop to relax later
);

create index if not exists idx_household_members_user on public.household_members (user_id);

create table if not exists public.household_invites (
  code         text        primary key,
  household_id uuid        not null references public.households (id) on delete cascade,
  created_by   uuid        not null references auth.users (id)       on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz    -- null = no expiry (v1)
);

create index if not exists idx_household_invites_household on public.household_invites (household_id);

-- ---------------------------------------------------------------------------
-- 2. Add household_id columns (nullable for now; populated by the backfill)
-- ---------------------------------------------------------------------------

alter table public.budget_settings add column if not exists household_id uuid references public.households (id) on delete cascade;
alter table public.categories      add column if not exists household_id uuid references public.households (id) on delete cascade;
alter table public.expenses        add column if not exists household_id uuid references public.households (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 3. Backfill: one household per existing user, carrying their data across.
--    Skips users that already have a membership, so it is safe to re-run.
-- ---------------------------------------------------------------------------

do $$
declare
  r  record;
  hh uuid;
begin
  for r in select id, currency, timezone from public.profiles loop
    if exists (select 1 from public.household_members where user_id = r.id) then
      continue;
    end if;

    insert into public.households (currency, timezone)
      values (coalesce(r.currency, 'RSD'), coalesce(r.timezone, 'Europe/Belgrade'))
      returning id into hh;

    insert into public.household_members (household_id, user_id, role)
      values (hh, r.id, 'owner');

    update public.budget_settings set household_id = hh where user_id = r.id;
    update public.categories      set household_id = hh where user_id = r.id;
    update public.expenses        set household_id = hh where user_id = r.id;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Drop the old per-user RLS policies BEFORE the column surgery
--    (they reference user_id).
-- ---------------------------------------------------------------------------

drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
drop policy if exists "profiles_delete" on public.profiles;

drop policy if exists "budget_select" on public.budget_settings;
drop policy if exists "budget_insert" on public.budget_settings;
drop policy if exists "budget_update" on public.budget_settings;
drop policy if exists "budget_delete" on public.budget_settings;

drop policy if exists "categories_select" on public.categories;
drop policy if exists "categories_insert" on public.categories;
drop policy if exists "categories_update" on public.categories;
drop policy if exists "categories_delete" on public.categories;

drop policy if exists "expenses_select" on public.expenses;
drop policy if exists "expenses_insert" on public.expenses;
drop policy if exists "expenses_update" on public.expenses;
drop policy if exists "expenses_delete" on public.expenses;

-- ---------------------------------------------------------------------------
-- 5. Enforce constraints + finish the re-keying
-- ---------------------------------------------------------------------------

-- budget_settings: household_id becomes the primary key; user_id goes away.
alter table public.budget_settings alter column household_id set not null;
alter table public.budget_settings drop constraint if exists budget_settings_pkey;
alter table public.budget_settings add  constraint budget_settings_pkey primary key (household_id);
alter table public.budget_settings drop column if exists user_id;

-- categories: swap the user index for a household index; drop user_id.
alter table public.categories alter column household_id set not null;
drop index if exists public.idx_categories_user_sort;
create index if not exists idx_categories_household_sort on public.categories (household_id, sort_order);
alter table public.categories drop column if exists user_id;

-- expenses: keep user_id (now = added_by); reindex on household.
alter table public.expenses alter column household_id set not null;
drop index if exists public.idx_expenses_user_spent_at;
drop index if exists public.idx_expenses_user_category;
create index if not exists idx_expenses_household_spent_at on public.expenses (household_id, spent_at);
create index if not exists idx_expenses_household_category on public.expenses (household_id, category_id);
create index if not exists idx_expenses_added_by          on public.expenses (user_id);

-- profiles: currency + timezone now live on households.
alter table public.profiles drop column if exists currency;
alter table public.profiles drop column if exists timezone;

-- ---------------------------------------------------------------------------
-- 6. SECURITY DEFINER helpers — the anti-recursion layer.
--    A membership check written inline in a policy re-triggers RLS on
--    household_members and recurses. These bypass RLS on the lookup.
-- ---------------------------------------------------------------------------

create or replace function public.current_household_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select household_id from public.household_members where user_id = auth.uid()
$$;

create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid()
  )
$$;

-- True if `other` is in the same household as the caller (for reading co-members'
-- profile display names in attribution).
create or replace function public.same_household(other uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members m_self
    join public.household_members m_other
      on m_self.household_id = m_other.household_id
    where m_self.user_id = auth.uid() and m_other.user_id = other
  )
$$;

-- ---------------------------------------------------------------------------
-- 7. New membership-based RLS
-- ---------------------------------------------------------------------------

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;

-- households — members read/update their own household. Creation happens only
-- via the SECURITY DEFINER trigger / join RPC, so no insert/delete policy.
create policy "households_select" on public.households for select using (public.is_household_member(id));
create policy "households_update" on public.households for update using (public.is_household_member(id)) with check (public.is_household_member(id));

-- household_members — a member can see every row of their household (needed for
-- the members list). Mutations flow through the definer trigger / join RPC.
create policy "members_select" on public.household_members for select using (public.is_household_member(household_id));

-- household_invites — members manage their household's codes. The joiner never
-- reads this table directly; join_household() (definer) resolves the code.
create policy "invites_select" on public.household_invites for select using (public.is_household_member(household_id));
create policy "invites_insert" on public.household_invites for insert with check (public.is_household_member(household_id) and created_by = auth.uid());
create policy "invites_delete" on public.household_invites for delete using (public.is_household_member(household_id));

-- profiles — own row, plus read-only visibility of co-members (attribution).
create policy "profiles_select" on public.profiles for select using (id = auth.uid() or public.same_household(id));
create policy "profiles_insert" on public.profiles for insert with check (id = auth.uid());
create policy "profiles_update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_delete" on public.profiles for delete using (id = auth.uid());

-- budget_settings — one cap per household.
create policy "budget_select" on public.budget_settings for select using (public.is_household_member(household_id));
create policy "budget_insert" on public.budget_settings for insert with check (public.is_household_member(household_id));
create policy "budget_update" on public.budget_settings for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "budget_delete" on public.budget_settings for delete using (public.is_household_member(household_id));

-- categories — shared per household.
create policy "categories_select" on public.categories for select using (public.is_household_member(household_id));
create policy "categories_insert" on public.categories for insert with check (public.is_household_member(household_id));
create policy "categories_update" on public.categories for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "categories_delete" on public.categories for delete using (public.is_household_member(household_id));

-- expenses — the shared pool. Any member reads/edits/deletes; inserts must be
-- truthfully attributed to the actor.
create policy "expenses_select" on public.expenses for select using (public.is_household_member(household_id));
create policy "expenses_insert" on public.expenses for insert with check (public.is_household_member(household_id) and user_id = auth.uid());
create policy "expenses_update" on public.expenses for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "expenses_delete" on public.expenses for delete using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- 8. New-user seeding: profile + household-of-one + membership + cap + categories
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hh uuid;
begin
  insert into public.profiles (id) values (new.id);

  insert into public.households default values returning id into hh;
  insert into public.household_members (household_id, user_id, role)
    values (hh, new.id, 'owner');

  insert into public.budget_settings (household_id) values (hh);
  insert into public.categories (household_id, name, color, sort_order) values
    (hh, 'Groceries',  'sage-500',   0),
    (hh, 'Eating out', 'accent-500', 1),
    (hh, 'Transport',  'sand-500',   2),
    (hh, 'Home',       'accent-700', 3),
    (hh, 'Fun',        'sage-700',   4);

  return new;
end;
$$;

-- Trigger on_auth_user_created already exists from 0001 and calls this function.

-- ---------------------------------------------------------------------------
-- 9. join_household(code) — merge the caller's data into the invite's household.
--    v1 rule: "your data comes with you." Runs as SECURITY DEFINER so it can
--    read the invite (the joiner isn't a member yet) and move rows across
--    households in one transaction.
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
  update public.expenses e
     set household_id = target_household,
         category_id  = (
           select t.id from public.categories t
           where t.household_id = target_household
             and t.name = (select c.name from public.categories c where c.id = e.category_id)
           limit 1
         )
   where e.household_id = old_household and e.user_id = me;

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
