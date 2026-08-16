-- Currency must be stamped by the server, not trusted from any client.
--
-- src/lib/mutations/expenses.ts stamps `currency` from households.currency
-- on insert, and the (now-deleted) REST layer refused `currency` in the
-- request body — but neither is a real guarantee: RLS's expenses_insert
-- policy (0003_households.sql) only checks household membership, so a direct
-- PostgREST insert with `currency: 'EUR'` against an RSD household succeeds
-- today and quietly corrupts cap math (review-api-contract.md §2,
-- review-database.md). Now that the REST layer is gone and every insert
-- goes through the same PostgREST surface Server Actions and a future direct
-- client both use, this needs to be a DB invariant, not an app convention.

create or replace function public.expenses_stamp_currency()
returns trigger
language plpgsql
as $$
begin
  select currency into new.currency
    from public.households
    where id = new.household_id;
  return new;
end;
$$;

drop trigger if exists expenses_stamp_currency on public.expenses;
create trigger expenses_stamp_currency
  before insert on public.expenses
  for each row execute function public.expenses_stamp_currency();
