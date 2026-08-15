-- Per-user UI language (Phase 7 i18n). Distinct from households.timezone/
-- currency, which stay household-level — locale is a personal preference,
-- not something a shared cap needs to agree on.
alter table public.profiles
  add column locale text not null default 'en' check (locale in ('en', 'ru'));
