-- Optimistic concurrency for expenses.
--
-- Two household members editing the same expense today: last write wins,
-- silently, with no detection and no recovery (review-api-contract.md
-- "Caching & concurrency"). `expenses` had `created_at` but no `updated_at`,
-- and both the update and delete paths overwrote/removed unconditionally.
-- Given the whole product premise is two people sharing one pool, this is
-- the concurrency case most likely to actually happen.
--
-- `updated_at` is set unconditionally by a trigger, never accepted from the
-- client, so a caller can't spoof the token it later has to present back.

alter table public.expenses
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.expenses_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger name sorts after "expenses_freeze" (0007) — Postgres fires
-- same-event row triggers in name order, so the freeze check runs first
-- against the pre-touch OLD/NEW values. Neither trigger inspects
-- updated_at, so the ordering has no behavioral effect between them; it's
-- noted here so it stays that way if either trigger changes.
drop trigger if exists expenses_touch_updated_at on public.expenses;
create trigger expenses_touch_updated_at
  before update on public.expenses
  for each row execute function public.expenses_touch_updated_at();
