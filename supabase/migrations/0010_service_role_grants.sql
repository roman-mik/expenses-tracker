-- Grant service_role full access to every public table.
--
-- Discovered building the integration test harness (P2 item 23): seeding
-- `allowed_emails` with the service-role key — the standard way to
-- provision test/admin data, and how a real ops workflow would add an
-- invitee outside the app — failed with "permission denied for table
-- allowed_emails" on a fresh `supabase db reset`. Checking every table
-- confirmed it's not isolated to that one:
--
--   select table_name, string_agg(privilege_type, ',')
--   from information_schema.role_table_grants
--   where grantee = 'service_role' and table_schema = 'public'
--   group by table_name;
--
-- returned only TRUNCATE/REFERENCES/TRIGGER on every table in `public` —
-- zero SELECT/INSERT/UPDATE/DELETE anywhere. This is the exact same class
-- of bug 0006_table_grants.sql found and fixed for `authenticated`/`anon`,
-- just never checked for `service_role`: none of 0001-0004 (nor 0006, nor
-- 0008 for the table it added) ever GRANT anything to it. service_role has
-- BYPASSRLS, so this was invisible to the app itself — every in-app writer
-- to these tables goes through RLS-scoped `authenticated` or a SECURITY
-- DEFINER function (which bypasses grants entirely, same reason 0006's gap
-- was invisible) — but any admin/ops workflow that authenticates as
-- service_role (a seeding script, a cron job, this test harness) hits a
-- wall on a fresh project. Supabase Cloud's project-creation bootstrap
-- grants service_role broadly outside of any migration this repo controls
-- (same caveat 0006 documents); a fresh `supabase db reset` or a fresh
-- hosted project provisioned outside that exact flow inherits none of it.

grant select, insert, update, delete on public.allowed_emails to service_role;
grant select, insert, update, delete on public.households to service_role;
grant select, insert, update, delete on public.household_members to service_role;
grant select, insert, update, delete on public.household_invites to service_role;
grant select, insert, update, delete on public.join_attempts to service_role;
grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.budget_settings to service_role;
grant select, insert, update, delete on public.categories to service_role;
grant select, insert, update, delete on public.expenses to service_role;
