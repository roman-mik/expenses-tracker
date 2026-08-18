-- pgTAP RLS suite for ledger_fx_rates (0015_ledger_fx_rates.sql).
-- Run with: supabase test db
--
-- Rates are global, not household-scoped: any authenticated user can read
-- them, but only service_role can write — the daily cron is the single
-- writer, so a client can never forge a rate.

begin;

create schema if not exists tests;
grant usage on schema tests to authenticated;
create or replace function tests.login_as(uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$ language plpgsql;
grant execute on function tests.login_as(uuid) to authenticated;

select plan(3);

select gen_random_uuid() as alice_id \gset

insert into public.allowed_emails (email) values ('pgtap-fx-alice@example.com');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (:'alice_id', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-fx-alice@example.com', crypt('password', gen_salt('bf')), now(), '{}', '{}', now(), now());

-- Seeded as the (BYPASSRLS) superuser this file runs as, standing in for the
-- service_role cron.
insert into public.ledger_fx_rates (base_code, quote_code, rate_e8, as_of_date, source)
  values ('EUR', 'RSD', 11700000000, current_date, 'test-provider');

select tests.login_as(:'alice_id');

select is(
  (select count(*)::int from public.ledger_fx_rates where base_code = 'EUR' and quote_code = 'RSD'),
  1, 'an authenticated user can read fx rates');

select throws_ok(
  format($$ insert into public.ledger_fx_rates (base_code, quote_code, rate_e8, as_of_date, source)
            values ('USD', 'RSD', 10000000000, current_date, 'forged') $$),
  '42501', null,
  'an authenticated user cannot insert an fx rate');

-- No update grant at all for `authenticated` (only `select`, see
-- 0015_ledger_fx_rates.sql) — table-level privilege is checked before RLS,
-- so this is a permission-denied error, not a silently-filtered 0-row update.
select throws_ok(
  format($$ update public.ledger_fx_rates set rate_e8 = 1 where base_code = 'EUR' and quote_code = 'RSD' $$),
  '42501', null,
  'an authenticated user cannot update an fx rate');

select * from finish();
rollback;
