-- Explicit table-level grants for `authenticated`.
--
-- Discovered while retrofitting supabase/tests/database/join_household.sql to
-- actually run as the `authenticated` role instead of the BYPASSRLS
-- superuser: none of migrations 0001-0004 ever issue a GRANT. Every table in
-- `public` had only TRUNCATE/REFERENCES/TRIGGER granted to anon/authenticated
-- (`Dxtm`) and no SELECT/INSERT/UPDATE/DELETE (`arwd`) at all — RLS policies
-- were doing nothing, because Postgres checks table-level privileges before
-- RLS is ever consulted, and none existed. The app has been running only
-- because Supabase Cloud's project-creation bootstrap grants these outside
-- of any migration this repo controls; a fresh `supabase db reset`, a fresh
-- hosted project, or any deployment path that doesn't go through that
-- specific dashboard flow inherits none of it.
--
-- Grant exactly the verbs each table's policy set exercises (0003:191-233).
-- `anon` gets nothing: every policy predicate keys off auth.uid(), which is
-- null for anon, so anon grants would be reachable-but-always-denied at
-- best — omitting them is the same effective access with one less thing to
-- audit.

grant select, update on public.households to authenticated;
grant select on public.household_members to authenticated;
grant select, insert, delete on public.household_invites to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.budget_settings to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
