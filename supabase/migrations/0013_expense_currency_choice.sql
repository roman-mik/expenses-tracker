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
