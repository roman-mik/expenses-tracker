## Database Design

**Overall assessment.** For a four-migration schema this is unusually well-considered: money is integer minor units in `bigint`, month boundaries are computed from an explicit household IANA timezone rather than from `now()::date`, and the household re-keying in 0003 correctly drops the old per-user policies *before* the column surgery and uses `SECURITY DEFINER` helpers to break RLS recursion on `household_members`. The weak spots are concentrated in three places: (1) `public.allowed_emails` (0002) has no RLS at all while sitting in the PostgREST-exposed `public` schema; (2) the invite/join flow has no expiry, no single-use semantics, and no collision retry, and `join_household` silently corrupts currency semantics and steals rows out of a multi-member source household; (3) integrity that the app *assumes* is not expressed as constraints — a category can belong to a different household than the expense referencing it, `expenses.user_id` can be re-pointed at an arbitrary user on UPDATE, and `role`/`currency`/`timezone`/`color` are unconstrained `text`. pgTAP coverage exists but runs as a superuser, so it exercises zero RLS.

---

### `public.allowed_emails` has RLS disabled in a PostgREST-exposed schema

**Status: fixed** — `supabase/migrations/0005_lock_allowlist.sql`. Also fixed in the same migration: `enforce_allowlist()` compares `email = lower(new.email)` but nothing normalized the stored column, so uppercase rows could never match — added a `check (email = lower(email))` constraint and backfilled existing rows.

**Severity: Critical**

`supabase/migrations/0002_optional_allowlist.sql:16-18` creates `public.allowed_emails` and never calls `alter table ... enable row level security`. Every other table in the project gets RLS (`0001_phase1_init.sql:66-69`, `0003_households.sql:191-193`); this one is the sole exception. It sits in `public`, which `supabase/config.toml` exposes over the Data API (`schemas = ["public", "graphql_public"]`). On any project where `public` tables were granted to `anon`/`authenticated` (the historical Supabase default, and the reason the `auto_expose_new_tables` note exists in the config), this means the full allowlist — a list of real email addresses — is readable by anonymous clients at `GET /rest/v1/allowed_emails`, and writable, which turns the "belt-and-suspenders" sign-up gate into a self-service sign-up: `POST /rest/v1/allowed_emails {"email":"attacker@evil.com"}` then sign up.

The pgTAP suite even inserts into it directly (`supabase/tests/database/join_household.sql:20-21`), confirming it is a plain unprotected table.

Fix — deny-by-default, no policies at all (the trigger reads it as `SECURITY DEFINER`, which bypasses RLS):

```sql
alter table public.allowed_emails enable row level security;
revoke all on public.allowed_emails from anon, authenticated;
```

Verify with `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace;` — every row must be `t`.

### Invite codes never expire, are unlimited-use, and collide loudly

**Severity: High**

`supabase/migrations/0003_households.sql:41-47` declares `expires_at timestamptz` nullable with the comment `null = no expiry (v1)`, and the app never sets it — `src/lib/mutations/household.ts:31-35` inserts `{code, household_id, created_by}` only. `join_household` accepts `expires_at is null` (`0003_households.sql:293`) and does not delete the invite after redemption (`:290-328`). Net effect: a code pasted into a chat once is a permanent, unlimited-use bearer token granting full read/write on the household's entire expense history and cap.

Two secondary problems in the same flow:

- `code` is the primary key (`:42`) and `generateInviteCode()` produces 8 uppercase hex chars from `randomBytes(4)` — 32 bits. A collision surfaces as a raw Postgres `duplicate key value violates unique constraint "household_invites_pkey"` thrown to the user from `src/lib/mutations/household.ts:36`; there is no retry loop. 32 bits is also brute-forceable against the `join_household` RPC, which has no rate limiting and no attempt counter.
- `createInvite` deletes *all* prior codes for the household before inserting (`src/lib/mutations/household.ts:24-28`) — that policy ("one active code") is enforced in the app, not the DB, so a direct PostgREST insert can mint unlimited concurrent codes (the `invites_insert` policy at `0003_households.sql:207` permits it).

Fix — put the lifetime in the schema and make redemption consume the code:

```sql
alter table public.household_invites
  alter column expires_at set not null,
  alter column expires_at set default now() + interval '24 hours',
  add constraint household_invites_code_format check (code ~ '^[A-Z0-9]{10,}$');

-- at most one live invite per household, enforced in the DB
create unique index if not exists uq_household_invites_live
  on public.household_invites (household_id);
```

and inside `join_household`, after the membership move: `delete from public.household_invites where code = invite_code;`. Widen the code to at least 10 chars from `randomBytes(8)` (Crockford base32 reads better than hex over the phone) and retry on unique violation.

### `join_household` drags expenses out of a source household that still has members

**Severity: High**

`supabase/migrations/0003_households.sql:307-315` moves the caller's expenses with `where e.household_id = old_household and e.user_id = me`. The "your data comes with you" rule is stated for the household-of-one case, but nothing restricts it to that case. If the caller is in a *shared* household B and joins household A, every expense they ever logged leaves B — B's remaining member sees historical months silently re-total downward, and B's cap-vs-spent history is retroactively rewritten. The old household is only dropped when empty (`:324-326`), so this path is explicitly reachable, and the pgTAP suite constructs exactly this shape (a third member joins the owner's household, `supabase/tests/database/join_household.sql:42-45`) without asserting anything about the departing member's rows.

The joiner's *categories* are also never moved or cleaned up — they die with the cascade at `:325` when the old household is empty, and linger unreferenced when it is not.

Fix — refuse the ambiguous case rather than guessing:

```sql
if (select count(*) from public.household_members where household_id = old_household) > 1 then
  raise exception 'Leave your current household before joining another';
end if;
```

Then add an explicit `leave_household()` RPC with a stated rule for what happens to the leaver's rows (recommended: rows stay with the household, `user_id` attribution is preserved).

### Currency is silently reinterpreted on merge and on household currency change

**Severity: High**

`expenses.currency` is stamped at insert from the household (`src/lib/mutations/expenses.ts:22-29`) and is deliberately never patched. `join_household` moves rows across households without touching `currency` (`0003_households.sql:307-315`). `getSummary` counts only rows whose `currency` equals the household's current currency and dumps the rest into `otherCurrencies` (`src/lib/queries/summary.ts:65-78`). So a joiner whose old household was `EUR` merging into an `RSD` household has their whole history vanish from the cap math with no error and no UI signal.

The same hazard exists without any join: `households_update` (`0003_households.sql:198`) lets any member change `currency` freely, and `budget_settings.monthly_cap` "carries no currency — it is implicitly in `profiles.currency`" (`0001_phase1_init.sql:8-9`, now the household's). Because `CURRENCY_EXPONENT` differs per currency (`src/lib/types.ts:19-23`: RSD 0, EUR 2), flipping a household from RSD to EUR reinterprets a stored cap of `50000` from 50 000 RSD to 500.00 EUR — a 100× error, with no migration of the stored integer.

Fix — constrain the domain and make the currency switch an explicit, converting operation rather than a column update:

```sql
alter table public.households
  add constraint households_currency_supported check (currency in ('RSD','EUR','USD'));
alter table public.expenses
  add constraint expenses_currency_supported check (currency in ('RSD','EUR','USD'));
```

Then either (a) revoke `currency` from the `households_update` policy via a column-level grant and route changes through a definer function that rescales `monthly_cap` by the exponent delta, or (b) store `budget_settings.currency` explicitly alongside `monthly_cap` so a mismatch is detectable rather than silent. For the merge, block the join when `old.currency <> target.currency` until a conversion story exists.

### `expenses.user_id` can be re-pointed at any user on UPDATE

**Severity: Medium**

`expenses_insert` correctly forces truthful attribution — `... and user_id = auth.uid()` (`0003_households.sql:231`). `expenses_update` does not (`:232`): its `WITH CHECK` only re-tests `is_household_member(household_id)`. Any member can therefore `PATCH /rest/v1/expenses?id=eq.<id> {"user_id":"<any uuid in auth.users>"}` and attribute a purchase to their partner, or to a user in a completely unrelated household — the FK at `0001_phase1_init.sql:45` only requires the id to exist in `auth.users`. That row then appears in the household but its `user_id` resolves to no member, and `getHouseholdMembers` (`src/lib/queries/household.ts:59-65`) yields `displayName: null` for it.

Fix:

```sql
drop policy "expenses_update" on public.expenses;
create policy "expenses_update" on public.expenses for update
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id) and public.same_household(user_id));
```

### No constraint ties `expenses.category_id` to `expenses.household_id`

**Severity: Medium**

`expenses.category_id` references `public.categories (id)` (`0001_phase1_init.sql:46`) with no household component, and `categories.household_id` (`0003_households.sql:56`) is a separate FK. Nothing prevents an expense in household A from pointing at a category in household B. RLS makes this hard to *exploit* (the attacker must know a foreign category UUID), but it is reachable by accident: `join_household`'s remap subquery (`0003_households.sql:309-314`) is the only code that keeps the two in sync, and it silently NULLs on no match. A future "move expense" or bulk-import path would violate it outright.

Postgres 17 (`supabase/config.toml`, `major_version = 17`) supports column-list `ON DELETE SET NULL`, so the composite FK is expressible without breaking `household_id NOT NULL`:

```sql
alter table public.categories add constraint categories_id_household_uq unique (id, household_id);
alter table public.expenses drop constraint expenses_category_id_fkey;
alter table public.expenses
  add constraint expenses_category_fkey
  foreign key (category_id, household_id) references public.categories (id, household_id)
  on delete set null (category_id);
```

### `on delete cascade` from `auth.users` destroys shared household history

**Severity: Medium**

`expenses.user_id` is `references auth.users (id) on delete cascade` (`0001_phase1_init.sql:45`), and 0003 keeps the column as *attribution* rather than ownership (`0003_households.sql:9`, `:128`). Deleting one member of a two-person household therefore deletes every expense they ever logged from the shared pool — the surviving partner's totals for every past month change. Attribution should degrade, not cascade.

```sql
alter table public.expenses alter column user_id drop not null;
alter table public.expenses drop constraint expenses_user_id_fkey;
alter table public.expenses add constraint expenses_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;
```

(Then relax `expenses_insert`'s `user_id = auth.uid()` to `user_id = auth.uid()` still — inserts must be attributed; only historical rows go null.)

Related: deleting the last member of a household leaves an orphan `households` row plus its `budget_settings` and `categories`, invisible to everyone because every policy keys on `is_household_member`. Add a `after delete on household_members` trigger that drops the household when it becomes empty, mirroring `0003_households.sql:324-326`.

### `household_members` has no INSERT/UPDATE/DELETE policies — and no way to leave

**Severity: Medium**

`0003_households.sql:202` defines `members_select` only. RLS default-deny makes that *safe* — mutations flow through the definer trigger and RPC as documented at `:201` — but it also means there is no supported path to leave a household or remove a member, and `unique (user_id)` (`:36`) makes joining a *new* household the only exit. A user who joins a partner's household can never get back to a household of their own; `join_household` short-circuits on the same household (`:301-303`) and there is no `leave_household`.

Fix: add a `leave_household()` definer RPC that creates a fresh household-of-one for the caller (reusing the seeding block at `:250-260`), moves the membership, and cleans up an emptied source household. Decide and document whether the leaver's expenses stay or travel — see the join finding above.

### `role`, `timezone`, `color`, and `locale` are unconstrained or under-constrained text

**Severity: Medium**

- `household_members.role text not null default 'member'` with the intent `'owner' | 'member'` in a comment only (`0003_households.sql:33`). No CHECK, no enum. It is also purely decorative: no policy or function reads it, so an "owner" has exactly the privileges of a "member" — and `join_household` demotes joiners to `'member'` (`:319`) without guaranteeing any household retains an owner.
- `households.timezone text not null default 'Europe/Belgrade'` (`:26`) with no validation. It is fed straight into `Intl.DateTimeFormat` (`src/lib/kapa-math.ts:35-42`); a garbage value throws `RangeError` on every summary render, hard-breaking the home screen for the whole household. Validate against `pg_timezone_names`.
- `categories.color text not null` (`0001_phase1_init.sql:29`) is a free-text design token (`'sage-500'`, `'accent-700'`) — commit `7ae2157 Fix missing category swatch colors` suggests this has already drifted once.
- `profiles.locale` (`0004_profile_locale.sql:5`) *is* CHECKed, which is the right instinct, but as an inline anonymous CHECK it needs a drop/re-add to extend. Name it.

```sql
alter table public.household_members
  add constraint household_members_role_check check (role in ('owner','member'));
alter table public.households
  add constraint households_timezone_valid
  check (timezone in (select name from pg_timezone_names));  -- or a trigger, since this isn't immutable
```

(`pg_timezone_names` is not immutable so it cannot literally live in a CHECK; use a `before insert or update` trigger, or a small allowlist table with an FK.)

### `categories` allows duplicate names within a household, which makes the join remap non-deterministic

**Severity: Medium**

`join_household` remaps an expense's category by *name* (`0003_households.sql:309-314`) with `limit 1` and no `order by`. There is no `unique (household_id, name)` on `categories`, so a target household with two "Groceries" rows resolves arbitrarily and inconsistently across rows in the same statement. The seeding function inserts five fixed names (`:255-260`) and `createCategory` (`src/lib/mutations/categories.ts:34-41`) does not check for duplicates, so this is easy to reach.

```sql
create unique index if not exists uq_categories_household_name
  on public.categories (household_id, lower(name));
```

Consider also a partial unique on non-archived rows if you want to allow reusing a name after archiving.

### No migration ever GRANTs table privileges to `anon`/`authenticated`

**Status: found and fixed during P0 remediation, not in the original review.** Discovered while retrofitting the pgTAP suite to run as `authenticated` instead of the BYPASSRLS superuser: it failed immediately on `permission denied for table household_invites`, and a check of `pg_class.relacl` confirmed every table in `public` had only `TRUNCATE`/`REFERENCES`/`TRIGGER` granted to `anon`/`authenticated` — none of `SELECT`/`INSERT`/`UPDATE`/`DELETE`. Postgres checks table-level privileges *before* RLS is ever consulted, so on a database bootstrapped purely from this repo's migrations (a fresh `supabase db reset`, or a hosted project provisioned outside Supabase Cloud's dashboard-driven project-creation flow), every one of the 22 policies in `0003_households.sql:191-233` is unreachable dead code and the app cannot read or write anything. The app evidently works in the real deployment only because Supabase Cloud's project bootstrap grants these outside of any migration this repo controls.

**Status: fixed** — `supabase/migrations/0006_table_grants.sql` grants exactly the verbs each table's policy set exercises, to `authenticated` only (nothing to `anon` — every policy predicate keys off `auth.uid()`, which is null for anon, so an anon grant would be reachable-but-always-denied at best).

### pgTAP tests run as superuser, so they verify none of the RLS

**Status: fixed** — see `docs/review/review-testing.md` §3 and `REVIEW.md` P0 item 4 for the retrofit and the `rls.sql` suite.

**Severity: Medium**

`supabase/tests/database/join_household.sql` sets `request.jwt.claims` (`:33-34`, `:42-43`, `:49-50`, …) but never issues `set local role authenticated`. `supabase test db` connects as `postgres`, which is `BYPASSRLS`, so every statement in the file — including the direct `insert into public.household_invites` at `:36-38` and `insert into public.categories` at `:52-54` — succeeds regardless of policy. The suite validates `join_household`'s *logic* (which it does well, 13 assertions) and nothing about the security model.

Given that RLS is the entire isolation story here, the gaps are the important part. Add `supabase/tests/database/rls.sql` covering:

```sql
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'joiner_id')::text, true);

select is_empty(
  format($$ select 1 from public.expenses where household_id = %L $$, :'owner_household'),
  'a non-member cannot read another household''s expenses');
select throws_ok(
  $$ insert into public.household_members (household_id, user_id) values (...) $$,
  '42501', null, 'a member cannot self-insert into another household');
select throws_ok(
  $$ insert into public.expenses (household_id, user_id, ...) values (<own hh>, <other user>, ...) $$,
  '42501', null, 'expense attribution cannot be spoofed on insert');
```

Also untested: `handle_new_user` seeding (profile + household + membership + cap + 5 categories), the `expenses_update` attribution hole above, `same_household` profile visibility, concurrent joins, and the 0003 backfill.

### 0001 and 0004 are not re-runnable; 0003's `set not null` can abort mid-migration

**Severity: Medium**

0001 uses `create table if not exists` / `create index if not exists` (`:17`, `:58-60`) but plain `create policy` (`:72-93`) and 0004 uses a plain `add column` (`0004_profile_locale.sql:4-5`). Both error on a second application. Forward-only `supabase db push` never re-runs a file, so this is not a live defect — but 0003 goes out of its way to be idempotent (`:17`, and the membership guard at `:70-72`), and the inconsistency will bite whoever tries to replay the directory into a fresh shadow DB by hand.

The sharper risk is `0003_households.sql:117`, `:123`, `:129` — three `alter column household_id set not null` statements whose backfill (`:64-85`) iterates `public.profiles`, not `auth.users`. Any `categories`/`expenses`/`budget_settings` row whose owner has no `profiles` row (possible if 0001's backfill at `:132-138` was run before that user existed, or if the 0002 allowlist trigger interfered with user creation) keeps `household_id = NULL`, and the whole migration aborts at the `set not null`. Guard it:

```sql
-- before the NOT NULL statements
delete from public.expenses        where household_id is null;
delete from public.categories      where household_id is null;
delete from public.budget_settings where household_id is null;
```

or, safer, iterate `auth.users` rather than `public.profiles` in the backfill loop at `:69`.

### `allowed_emails` case handling and the `char(3)` currency type

**Severity: Low**

- `enforce_allowlist` compares `lower(new.email)` against the stored value verbatim (`0002_optional_allowlist.sql:28`). A row inserted as `'You@Example.com'` — exactly what the usage comment at `:13-14` invites — never matches, and sign-up fails with "Sign-ups are currently closed" for a user who *is* allowlisted. Store normalized: `email text primary key check (email = lower(email))`, or use `citext`.
- `currency char(3)` (`0001_phase1_init.sql:20`, `:48`; `0003_households.sql:25`) — `char(n)` is blank-padded and its comparison semantics ignore trailing spaces, which is a long-standing Postgres footgun with no upside here. `text` with the CHECK from the currency finding above is strictly better.
- `budget_settings.updated_at` (`0001_phase1_init.sql:40`) is maintained by the app (`src/lib/mutations/cap.ts:27`), so a direct PostgREST write leaves it stale. A `before update` trigger setting `new.updated_at = now()` is three lines and removes the class. `categories` and `expenses` have no `updated_at` at all, which makes "who changed this shared expense, and when" unanswerable in a *shared* ledger.
- `expenses.amount_minor >= 0` (`0001_phase1_init.sql:47`) forbids negative amounts, so refunds and corrections have no representation. Intentional for v1, but worth recording as a known limit rather than an accident.
- `expenses.spent_at` has no upper bound; a typo'd year lands the row outside every month window and it becomes invisible-but-counted-nowhere. `check (spent_at < now() + interval '1 day')` is cheap.

### Index notes: one redundant, one unused, one worth adding

**Severity: Low**

- `idx_household_members_user` (`0003_households.sql:39`) is fully redundant with the `unique (user_id)` constraint at `:36`, which already builds a unique btree on exactly `(user_id)`. Drop it.
- `idx_expenses_added_by` (`0003_households.sql:134`) matches no predicate in `src/lib/queries/` — nothing filters expenses by `user_id`. Its only consumers are the `where e.user_id = me` inside `join_household` (`:315`, already narrowed by `household_id`) and the `auth.users` cascade. Keep it *only* for the cascade; note it is otherwise dead weight on the write path.
- The two indexes that matter both fit: `idx_expenses_household_spent_at` (`:132`) serves `getSummary`'s `household_id = ? and spent_at >= ? and spent_at < ?` (`src/lib/queries/summary.ts:53-56`) and `listExpenses`'s same predicate plus `order by spent_at desc` (`src/lib/queries/expenses.ts:26-34`); `idx_categories_household_sort` (`:125`) serves `getCategories`' `household_id = ? order by sort_order` (`src/lib/queries/categories.ts:16-17`). Good matches.
- `getActiveInviteCode` filters `household_id` then `order by created_at desc limit 1` (`src/lib/queries/household.ts:74-78`) against `idx_household_invites_household` (`:49`), which is `(household_id)` only — fine at one-invite-per-household scale, but if you keep history make it `(household_id, created_at desc)`.

### `current_household_id()` is dead code exposed as a public RPC

**Severity: Nit**

`0003_households.sql:146-154` defines `current_household_id()` as `SECURITY DEFINER`. No policy in the file uses it, and no application code calls it — `src/lib/auth/dal.ts:42-52` resolves the household with a plain `household_members` select instead. It is nonetheless published as a callable RPC (it appears in `src/lib/supabase/database.types.ts:278`). It leaks nothing (it is scoped to `auth.uid()`), but an unused `SECURITY DEFINER` function on the API surface is gratuitous. Either adopt it in `getHouseholdId` — it would be a strictly cheaper single-function call — or drop it.

---

## What's done well

- **Money as `bigint` minor units** (`0001_phase1_init.sql:37`, `:47`) with `check (>= 0)` — no float, no `numeric` rounding ambiguity, and the design rationale is written into the migration header (`:5-9`). Values stay far below the JS `Number.MAX_SAFE_INTEGER` boundary that `bigint`-over-PostgREST would otherwise threaten.
- **Timezone handling is genuinely correct**, which is rare. Month boundaries are half-open UTC instants derived from the household's IANA zone (`monthWindow`, `src/lib/kapa-math.ts:96-105`) and queried as `gte(startUtc) / lt(endUtc)` (`src/lib/queries/summary.ts:55-56`) — no `date_trunc` on a `timestamptz` at server local time, and no `between` off-by-one at the month edge. Per-day bucketing uses the same zone via `zonedDateKey` (`src/lib/date.ts:8-16`), so a 23:30 local expense on the 31st cannot leak into the next month's cap. `zonedMidnightToUtc` even re-resolves the offset once to handle a DST transition landing on the 1st (`src/lib/kapa-math.ts:80-83`).
- **Currency stamped at insert, never patched** (`0001_phase1_init.sql:6-7`, `src/lib/mutations/expenses.ts:29`, and the explicit note at `src/lib/mutations/expenses.ts:50-53`) — history stays currency-stable. The remaining gap is the *household*-side change, not this.
- **The RLS recursion problem was anticipated and solved properly.** The comment at `0003_households.sql:141-143` diagnoses it exactly, and the `SECURITY DEFINER` + `stable` + `set search_path = public` helpers (`:146-185`) are the correct shape. All five definer functions in the repo pin `search_path`, and all call `auth.uid()` schema-qualified so the pinned path can't break them.
- **Policy ordering in 0003 is right**: old `user_id` policies are dropped (`:92-110`) *before* the columns they reference are dropped (`:120`, `:126`), which is the failure mode most re-keying migrations hit.
- **Truthful attribution on insert** — `expenses_insert` requires `user_id = auth.uid()` (`:231`), so a member cannot log spend in someone else's name. (Only the UPDATE path misses it.)
- **`join_household` is a single transactional RPC** rather than a multi-step client dance, correctly no-ops on re-join (`:301-303`), and cleans up the emptied source household (`:324-326`).
- **`same_household` for co-member profile visibility** (`:171-185`, used at `:211`) is a precise, minimal widening of the profiles policy — display names only, no broader read.
- **Invite codes come from `crypto.randomBytes`** (`src/lib/mutations/household.ts:11`), a CSPRNG — not `Math.random()`. The length is the problem, not the source.
- **Migration headers document intent and trade-offs** (`0001:4-11`, `0003:1-17`, `0004:1-3`), including the known rough edge on category merge (`0003:305-306`). The pgTAP suite, though it needs a role fix, is thorough on the logic it does cover and explains its impersonation strategy up front.
