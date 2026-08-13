-- OPTIONAL — defense-in-depth email allowlist.
--
-- The PRIMARY gate for closed registration is the Supabase dashboard toggle
-- (Authentication → "Allow new users to sign up" = OFF) plus manually-created
-- users. This migration is an extra backstop that hard-rejects any sign-up
-- whose email is not explicitly allowed, even if the toggle were ever flipped.
--
-- Only apply this if you want the belt-and-suspenders guarantee. A BEFORE
-- INSERT trigger on auth.users can interfere with Supabase-managed flows if
-- misconfigured — test a real invite/sign-in after applying.
--
-- To use: apply this file, then
--   insert into public.allowed_emails (email) values ('you@example.com');
--   insert into public.allowed_emails (email) values ('friend@example.com');

create table if not exists public.allowed_emails (
  email text primary key
);

create or replace function public.enforce_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.allowed_emails where email = lower(new.email)
  ) then
    raise exception 'Sign-ups are currently closed';
  end if;
  return new;
end;
$$;

drop trigger if exists before_auth_user_insert on auth.users;
create trigger before_auth_user_insert
  before insert on auth.users
  for each row execute function public.enforce_allowlist();
