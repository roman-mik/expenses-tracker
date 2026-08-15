-- Lock down public.allowed_emails.
--
-- 0002_optional_allowlist.sql created this table with no RLS and no grants at
-- all. It sits in the `public` schema, which is exposed over PostgREST — on
-- any project where `anon`/`authenticated` hold the historical default table
-- privileges, that means the full invited-email list is readable (and
-- insertable — a self-service signup bypass) by anyone with the publishable
-- key, which every visitor's JS bundle ships. Close both paths.

alter table public.allowed_emails enable row level security;
-- No policies at all: enforce_allowlist() is SECURITY DEFINER, so the trigger
-- itself bypasses RLS. Nobody else needs to read or write this table.
revoke all on public.allowed_emails from anon, authenticated;

-- Normalize existing rows and enforce it going forward. enforce_allowlist()
-- (0002:27-29) compares `email = lower(new.email)`, so a row stored with any
-- uppercase character could never match a real sign-up attempt.
update public.allowed_emails set email = lower(email) where email <> lower(email);
alter table public.allowed_emails
  add constraint allowed_emails_lowercase check (email = lower(email));
