-- Let a client choose an expense's currency (RSD, EUR, USD, RUB) instead of
-- always inheriting the household's.
--
-- 0009_expense_currency_stamp.sql made currency a DB invariant because RLS's
-- expenses_insert policy only checks household membership, so a direct
-- PostgREST insert could stamp an arbitrary currency and corrupt cap math.
-- That protection now moves from "always overwrite" to "default + validate":
-- the trigger only fills in the household's currency when the client didn't
-- send one, and a check constraint rejects anything outside the supported
-- set — so a spoofed insert/update still can't corrupt cap math, but a real
-- currency choice from the app is no longer clobbered.

create or replace function public.expenses_stamp_currency()
returns trigger
language plpgsql
as $$
begin
  if new.currency is null then
    select currency into new.currency
      from public.households
      where id = new.household_id;
  end if;
  return new;
end;
$$;

alter table public.expenses
  add constraint expenses_currency_allowed
  check (currency in ('RSD', 'EUR', 'USD', 'RUB'));

-- 0007_expense_attribution.sql's expenses_freeze trigger separately blocked
-- UPDATE from ever touching currency at all ("currency is immutable"), on
-- top of the insert-time stamp above. That's now a deliberate product
-- decision to relax, not an oversight: users can correct an expense's
-- currency after the fact (src/lib/mutations/expenses.ts updateExpense).
-- user_id / household_id / created_at stay frozen for the reasons in 0007 —
-- only the currency check is dropped here.
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
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at is immutable';
  end if;
  return new;
end;
$$;
