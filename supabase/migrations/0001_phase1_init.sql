-- Kapa — Phase 1 schema, RLS, and new-user seeding.
-- Apply with `supabase db push` or paste into the Supabase SQL editor.
--
-- Design notes:
--   * Money is stored as integer MINOR UNITS (`amount_minor`, `monthly_cap`).
--   * `expenses.currency` is copied from the profile at insert time so history
--     stays currency-stable even if the profile currency later changes.
--   * `budget_settings.monthly_cap` carries no currency — it is implicitly in
--     `profiles.currency` (the active currency).
--   * Month boundaries are computed app-side from `profiles.timezone`.
--   * RLS is the security backstop; the app also checks auth in its DAL.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  currency     char(3)     not null default 'RSD',
  timezone     text        not null default 'Europe/Belgrade',
  created_at   timestamptz not null default now()
);

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  name       text        not null,
  color      text        not null,
  sort_order int         not null default 0,
  archived   boolean     not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.budget_settings (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  monthly_cap   bigint      not null default 0 check (monthly_cap >= 0),
  nudge_enabled boolean     not null default true,
  nudge_pct     int         not null default 80 check (nudge_pct between 1 and 100),
  updated_at    timestamptz not null default now()
);

create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  category_id  uuid        references public.categories (id) on delete set null,
  amount_minor bigint      not null check (amount_minor >= 0),
  currency     char(3)     not null,
  note         text,
  spent_at     timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_expenses_user_spent_at on public.expenses (user_id, spent_at);
create index if not exists idx_expenses_user_category on public.expenses (user_id, category_id);
create index if not exists idx_categories_user_sort   on public.categories (user_id, sort_order);

-- ---------------------------------------------------------------------------
-- Row-Level Security — per-user isolation on every table
-- ---------------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.categories      enable row level security;
alter table public.budget_settings enable row level security;
alter table public.expenses        enable row level security;

-- profiles (keyed by id)
create policy "profiles_select" on public.profiles for select using (id = auth.uid());
create policy "profiles_insert" on public.profiles for insert with check (id = auth.uid());
create policy "profiles_update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_delete" on public.profiles for delete using (id = auth.uid());

-- budget_settings (keyed by user_id)
create policy "budget_select" on public.budget_settings for select using (user_id = auth.uid());
create policy "budget_insert" on public.budget_settings for insert with check (user_id = auth.uid());
create policy "budget_update" on public.budget_settings for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "budget_delete" on public.budget_settings for delete using (user_id = auth.uid());

-- categories
create policy "categories_select" on public.categories for select using (user_id = auth.uid());
create policy "categories_insert" on public.categories for insert with check (user_id = auth.uid());
create policy "categories_update" on public.categories for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "categories_delete" on public.categories for delete using (user_id = auth.uid());

-- expenses
create policy "expenses_select" on public.expenses for select using (user_id = auth.uid());
create policy "expenses_insert" on public.expenses for insert with check (user_id = auth.uid());
create policy "expenses_update" on public.expenses for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "expenses_delete" on public.expenses for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- New-user seeding: profile + budget_settings + 5 default categories.
-- Fires for ALL new auth.users rows, including users created manually in the
-- dashboard while public sign-ups are disabled.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.budget_settings (user_id) values (new.id);
  insert into public.categories (user_id, name, color, sort_order) values
    (new.id, 'Groceries',  'sage-500',   0),
    (new.id, 'Eating out', 'accent-500', 1),
    (new.id, 'Transport',  'sand-500',   2),
    (new.id, 'Home',       'accent-700', 3),
    (new.id, 'Fun',        'sage-700',   4);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Backfill: seed any users that already existed BEFORE this migration ran
-- (e.g. accounts created manually in the dashboard first). Idempotent — safe
-- to re-run. Without this, reads on profiles/budget_settings would fail for
-- pre-existing users because the trigger only fires on new inserts.
-- ---------------------------------------------------------------------------

insert into public.profiles (id)
  select id from auth.users
  on conflict (id) do nothing;

insert into public.budget_settings (user_id)
  select id from auth.users
  on conflict (user_id) do nothing;

insert into public.categories (user_id, name, color, sort_order)
  select u.id, c.name, c.color, c.sort_order
  from auth.users u
  cross join (values
    ('Groceries',  'sage-500',   0),
    ('Eating out', 'accent-500', 1),
    ('Transport',  'sand-500',   2),
    ('Home',       'accent-700', 3),
    ('Fun',        'sage-700',   4)
  ) as c(name, color, sort_order)
  where not exists (
    select 1 from public.categories x where x.user_id = u.id
  );
