# Ledger Epic A — Accounts and current position

**Status:** planned 2026-08-17 · **Spec:** `docs/ledger-user-stories.md` §5 Epic A · **Plan of record:** `PLAN.md` §9

---

## 1. Context

`PLAN.md` §9 shipped the Ledger *shell* only — the `app/ledger/*` routes, the desktop gate,
`LedgerRail`, `AppSwitcher`, and seven placeholder screens. There is no ledger data model:
no `ledger_*` migrations exist, and every screen renders `LedgerPlaceholder`.

Epic A is the foundation everything else in the spec stands on. Nothing in Epics B–G can be
computed without it: the projection engine needs a starting balance per account (D1/D2), every
chart needs a reporting currency to render into (D15), and reproducible projections need dated
FX snapshots rather than live rates (D11). Getting this layer wrong — floats for rates, source
amounts silently rewritten, rates fetched at render time — is expensive to unwind later.

**Deliverable:** all four Epic A stories (A1–A4), so that after this work the app knows what
the user actually has today, in one comparable unit, from numbers that reproduce.

**Decisions taken (this session):**

| Question | Decision |
|---|---|
| Scope | A1–A4, all of Epic A (A4 is `[P2]` in the spec — pulled forward deliberately) |
| Storage | Supabase, household-scoped `ledger_*` tables reusing `is_household_member()` (per `PLAN.md` §9) |
| FX ingestion | Daily Vercel cron writing dated snapshots — never fetched at render time (D11) |
| Reporting currency | Per-household: a new column on `households` |
| Currency set | Reuse the existing `CURRENCIES` enum (RSD/EUR/USD/RUB) and check-constraint pattern |

**Non-goals:** the projection engine, income streams, obligations, scenarios, work calendars,
one-off events, dark mode. Any of those appearing in this work is scope creep.

---

## 2. Data model

Three additive migrations. All are backward compatible with the previous release — required,
because `release-please.yml` runs `supabase db push` *before* the Vercel deploy (see `README.md`).

### 2a. `supabase/migrations/0014_ledger_accounts.sql`

```sql
create table public.ledger_accounts (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references public.households(id) on delete cascade,
  name                  text not null,
  currency              text not null,
  current_balance_minor bigint not null default 0,   -- MAY be negative (overdraft); no check
  type                  text not null,
  include_in_total      boolean not null default true,
  sort_order            int not null default 0,
  archived              boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint ledger_accounts_currency_allowed check (currency in ('RSD','EUR','USD','RUB')),
  constraint ledger_accounts_type_allowed     check (type in ('business','personal','savings')),
  constraint ledger_accounts_name_len         check (char_length(btrim(name)) between 1 and 60)
);
create index ledger_accounts_household_idx on public.ledger_accounts (household_id, sort_order);
```

Plus, mirroring existing migrations exactly rather than inventing new patterns:

- **RLS** — enable, then four policies gated on `public.is_household_member(household_id)`.
  Copy the policy shape from `supabase/migrations/0003_households.sql`.
- **Grants** — `grant select, insert, update, delete ... to authenticated, service_role`,
  following `0006_table_grants.sql` and `0010_service_role_grants.sql`. Missing grants are a
  known past footgun; `0010`'s comment explains why.
- **`updated_at`** — reuse the trigger function introduced in `0011_expense_updated_at.sql`.
  Check first whether it is generic or expense-specific; if the latter, extract a shared
  `public.set_updated_at()` in this migration and repoint the expenses trigger at it.
- **Reporting currency** —
  ```sql
  alter table public.households add column ledger_reporting_currency text;
  update public.households set ledger_reporting_currency = currency;
  alter table public.households
    alter column ledger_reporting_currency set not null,
    alter column ledger_reporting_currency set default 'RSD',
    add constraint households_ledger_reporting_currency_allowed
      check (ledger_reporting_currency in ('RSD','EUR','USD','RUB'));
  ```
  Backfilled from `households.currency` rather than defaulted blindly, so existing households
  keep the unit they already think in. `households.currency` is untouched — Kapa's cap math
  must not move (D15: source amounts are never rewritten).

### 2b. `supabase/migrations/0015_ledger_fx_rates.sql`

FX rates are **global reference data**, not household-scoped — the same ECB-style rate serves
everyone, and per-household copies would drift.

```sql
create table public.ledger_fx_rates (
  base_code  text not null,
  quote_code text not null,
  rate_e8    bigint not null check (rate_e8 > 0),  -- rate × 10^8, integer
  as_of_date date not null,
  source     text not null,
  fetched_at timestamptz not null default now(),
  primary key (base_code, quote_code, as_of_date),
  constraint ledger_fx_rates_base_allowed  check (base_code  in ('RSD','EUR','USD','RUB')),
  constraint ledger_fx_rates_quote_allowed check (quote_code in ('RSD','EUR','USD','RUB')),
  constraint ledger_fx_rates_distinct      check (base_code <> quote_code)
);
```

**Why `rate_e8 bigint` and not `numeric`:** `lib/types.ts` already commits this codebase to
integer money with no float arithmetic, and PostgREST returns `numeric` as a *string* that
would have to be parsed into a float somewhere. A fixed 10⁻⁸ scale keeps conversion exact and
reproducible (spec §7: "identical inputs must always give identical outputs"), and the largest
plausible rate here (~130 RSD/EUR) is nowhere near the `Number.MAX_SAFE_INTEGER` ceiling.

RLS: `select` allowed to `authenticated` (rates are not secret); **no** insert/update/delete
policy for `authenticated` — writes go through `service_role` only, so the cron is the single
writer and no client can forge a rate. Grants: `select` to `authenticated`, full to `service_role`.

### 2c. `supabase/migrations/0016_ledger_balance_snapshots.sql` (A4)

```sql
create table public.ledger_balance_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households(id) on delete cascade,
  account_id          uuid not null references public.ledger_accounts(id) on delete cascade,
  balance_minor       bigint not null,      -- what the user entered
  expected_minor      bigint not null,      -- what the app had stored
  currency            text not null,
  recorded_at         timestamptz not null default now(),
  note                text
);
```

Same RLS/grant treatment as `ledger_accounts`. The variance is `balance_minor - expected_minor`,
derived in TS rather than stored.

> **Scope seam, called out deliberately.** A4's third acceptance criterion — "offers to log the
> difference as an unbudgeted event" — needs `OneOffEvent`, which is story **C5**, not Epic A.
> This plan delivers the reconcile screen, the variance, and a durable snapshot row (which is
> what C5 will need to backfill from), and stops there. The "log it as an event" button lands
> with Epic C.

---

## 3. Application layers

The repo's three-layer split (`lib/queries` → `lib/mutations` → `app/actions`) stays; ledger
code gets its own namespace under it, matching the `app/ledger/*` + `components/ledger/*`
convention that commit `bd3bc44` established.

```
apps/web/src/lib/ledger/
  types.ts            LedgerAccount, AccountType, FxRate, LedgerSettings, BalanceSnapshot
  mappers.ts          toLedgerAccount, toFxRate  (row → domain, same idiom as lib/mappers.ts)
  validation.ts       Zod schemas (same idiom as lib/validation.ts)
  fx.ts               PURE. convert / pickRate / rateAgeDays / isStale
  fx.test.ts
  queries/{accounts,fx,settings}.ts
  mutations/{accounts,settings,balances}.ts
apps/web/src/app/actions/
  ledger-accounts.ts  ledger-settings.ts  ledger-balances.ts
```

**Reuse, do not re-create:**

- `Currency`, `Money`, `CURRENCIES`, `CURRENCY_EXPONENT` from `apps/web/src/lib/types.ts`.
- `formatMoney` from `apps/web/src/lib/format.ts` (display only, never arithmetic).
- `verifySession` / `getHouseholdId` from `apps/web/src/lib/auth/dal.ts`.
- `createClient` from `apps/web/src/lib/supabase/server.ts`; type via `SupabaseServerClient`.
- `reportError` from `apps/web/src/lib/observability.ts`.
- The `ActionResult` type — **import** it from `apps/web/src/app/actions/categories.ts` (or
  promote it to a shared module in this change) rather than declaring a fourth copy.
- Mutation signature shape: `(supabase, householdId, …)` returning domain objects, exactly as
  in `apps/web/src/lib/mutations/categories.ts`. `moveCategory`'s sibling-swap is the model for
  account reordering.
- Action shape: `verifySession` → `getHouseholdId` → Zod `safeParse` → mutation → `revalidatePath`,
  returning `{ok:true} | {ok:false, error}` with `getTranslations('Errors')` copy. See
  `apps/web/src/app/actions/categories.ts`.

### `lib/ledger/fx.ts` — the one piece of real math

Pure, integer-only, no `Date.now()` (spec §7: "pass dates in"). Mirrors the `lib/kapa-math.ts`
discipline.

```ts
convert(amountMinor, from, to, rate): Money
// quoteMinor = round( amountMinor × rate_e8 × 10^(quoteExp − baseExp) / 10^8 )
// half-up, away from zero. Document the rounding mode in a comment; test it.

pickRate(rates, { base, quote, onOrBefore }): FxRate | null
// the newest snapshot dated on or before the given day — NOT "the latest row".
// This is what makes A3's "same projection tomorrow gives the same numbers" true.

rateAgeDays(asOfDate, today): number
isStale(asOfDate, today): boolean   // > 30 days → A3's warning
```

Handle the identity case (`from === to` → return as-is, no rate needed) and the inverse case
(store `EUR→RSD`, derive `RSD→EUR` by inverting, or store both directions in the cron — prefer
**storing both directions** so no division-derived rate ever enters the model).

---

## 4. The FX cron

`apps/web/src/app/api/fx-refresh/route.ts`, modelled directly on
`apps/web/src/app/api/keepalive/route.ts`:

- `GET`, guarded by `Bearer ${process.env.CRON_SECRET}`, 401 otherwise. Vercel injects the header.
- Fetch all pairs among the four currencies, convert to `rate_e8`, upsert on
  `(base_code, quote_code, as_of_date)` so a re-run is idempotent.
- **All-or-nothing:** if the provider omits any of the four currencies, write *nothing*, call
  `reportError`, and return 500. Yesterday's snapshot staying in place is correct behaviour;
  a partial or zeroed rate silently corrupts every total on the Today screen.
- Register in `apps/web/vercel.json` alongside the existing keepalive entry:
  ```json
  { "path": "/api/fx-refresh", "schedule": "0 5 * * *" }
  ```

Two things to verify during implementation, both flagged rather than assumed:

1. **Provider coverage.** ECB reference rates (and therefore Frankfurter) do **not** publish
   RSD, and dropped RUB in 2022 — the two currencies that matter most here. Pick a free,
   keyless provider that actually returns all four (`open.er-api.com` is the leading candidate;
   the Serbian NBS and Russian CBR official feeds are the fallback), confirm the response
   shape by hand first, and record the provider name in the `source` column so a rate's
   provenance is always visible.
2. **Vercel Hobby cron allowance** (2 jobs, daily). This is the second one, so the allowance is
   now spent. If Vercel rejects it, the fallback is to call the refresh routine from inside the
   existing keepalive handler — one cron, two jobs — rather than dropping the schedule.

The route needs `service_role` to write (RLS blocks `authenticated`), so it must build a
service-role client. `apps/web/src/test/setup-integration.ts` shows how one is constructed;
that pattern moves into a small server-only helper here.

---

## 5. Screens

The spec's §4 IA gives Epic A no home for *managing* accounts — Today only *displays* them, and
Assumptions is explicitly "everything the model guessed", which accounts are not. So this adds
one route.

| Route | Content | Stories |
|---|---|---|
| `/ledger` (Today) | Hero total in reporting currency (sums only `include_in_total`); account chips showing native amount with the converted value secondary; a "rate is N days old" banner when stale; every converted figure reveals its source amount + the rate used, on hover/expand | A1, A2, A3 |
| `/ledger/accounts` **(new)** | Account list with add / edit / archive / reorder; name, currency, balance, type, `includeInTotal`; the reconcile panel (enter today's real balances → shows expected, actual, variance → writes snapshots) | A1, A4 |
| `/ledger/assumptions` | Reporting-currency selector; FX snapshot table (pair, rate, `asOfDate`, `source`, age badge, stale flag) | A2, A3 |

Adding `/ledger/accounts` is a **deliberate deviation** from the spec's seven-screen rail, with
the rationale above; the alternative — account CRUD in a dialog on Today — is available if you'd
rather keep the rail at seven. Add the rail entry directly under Today in
`apps/web/src/components/ledger/LedgerRail.tsx` and extend `LedgerRail.test.tsx` to match.

**Components** (new, under `apps/web/src/components/ledger/`):
`today/{HeroBalance,AccountChips,StaleRateBanner}.tsx`,
`accounts/{AccountList,AccountForm,ReconcilePanel}.tsx`,
`assumptions/{ReportingCurrencyPicker,FxSnapshotTable}.tsx`.

Reuse `components/ui/Button.tsx`, `PageHeader`, `PageLoadingShell`, and `useToast()` from
`components/ui/Toast.tsx` for write feedback — the pattern PR #17 established across every Kapa
form. Tailwind utilities against `@kapa/ui` tokens only; no new CSS, no `@theme` block in the app.
The amount input should follow `components/kapa/add/AddExpenseForm.tsx`, which already does the
`CURRENCY_EXPONENT` major→minor conversion and the radiogroup currency picker.

**i18n:** add `Ledger.accounts.*`, `Ledger.today.*`, `Ledger.fx.*` and any new `Errors.*` keys to
**both** `apps/web/messages/en.json` and `ru.json` — `src/test/messages.test.ts` fails CI on key
drift. Each new page keeps its own `verifySession()` + `redirect('/login')`; the ledger layout
deliberately does not authorize (see its header comment).

---

## 6. Tests

| Layer | Files | What it must prove |
|---|---|---|
| Unit (node) | `lib/ledger/fx.test.ts` | Conversion across differing exponents (RSD 0 ↔ EUR 2) in both directions; rounding at the half; identity conversion; `pickRate` picks on-or-before, not latest; staleness at 29/30/31 days |
| Unit (node) | `lib/ledger/mutations/*.test.ts`, `queries/*.test.ts` | CRUD + household scoping, using `src/test/fake-supabase.ts` and `src/test/factories.ts` |
| Unit (node) | `app/actions/ledger-accounts.test.ts` | Unauthenticated → error; bad input → error, no DB call; success → `revalidatePath`. Mirror `app/actions/categories.test.ts` |
| Route | `app/api/fx-refresh/route.test.ts` | 401 without the bearer; idempotent upsert; **no write at all** when the provider omits a currency |
| jsdom | `AccountList.test.tsx`, `ReportingCurrencyPicker.test.tsx`, updated `LedgerRail.test.tsx` | Rendering, the new rail entry, form submit paths |
| pgTAP | `supabase/tests/database/ledger_accounts.sql` | Member reads/writes own household; **non-member reads zero rows and cannot insert**; `authenticated` cannot write `ledger_fx_rates` but can read it. Follow `supabase/tests/database/rls.sql` |
| Integration | `src/test/integration/ledger-accounts.itest.ts` | Currency/type check constraints reject bad values; `on delete cascade` from `households` |

`REVIEW.md` records that the last audit found RLS untested and core math wrong with tests
encoding the same error — the pgTAP row and the `fx.test.ts` row are the direct answer to that.

---

## 7. Delivery

Cut each branch fresh off updated `origin/main` — never stack on an unmerged branch.
**`feat/ledger-shell` is not merged yet**, so slice 1 waits on it landing. Conventional Commit
titles are enforced on both commits and PR titles.

| # | Branch / title | Contents |
|---|---|---|
| 1 | `feat: add ledger accounts schema and reporting currency` | Migration 0014, `lib/ledger/{types,mappers,validation}`, queries/mutations/actions, `gen:types`, pgTAP + integration tests. No UI |
| 2 | `feat: add ledger fx snapshots and daily refresh` | Migration 0015, `lib/ledger/fx.ts` + tests, `/api/fx-refresh`, `vercel.json` cron |
| 3 | `feat: show ledger accounts and totals` | `/ledger/accounts` screen, rail entry, Today hero + chips, i18n |
| 4 | `feat: add ledger fx and reporting currency settings` | Assumptions screen content |
| 5 | `feat: add ledger balance reconciliation` | A4 — migration 0016, reconcile panel |

Update `PLAN.md` §9 as each slice lands (its "Not yet built" list is the ledger status board),
and run `graphify update .` after code changes, per `CLAUDE.md`.

---

## 8. Verification

**Every slice, before opening the PR** — these are exactly CI's gates
(`.github/workflows/ci.yml`), so failing them locally is a failing PR:

```bash
pnpm format:check && pnpm lint && pnpm knip && pnpm typecheck && pnpm test
supabase start
supabase db reset                      # migrations apply clean from scratch
pnpm gen:types && git diff --exit-code apps/web/src/lib/supabase/database.types.ts
pnpm test:db                           # pgTAP
pnpm test:integration
pnpm build
```

**End-to-end, by hand** (the Kapa lesson from PLAN.md: compile-green ≠ working):

1. `pnpm dev`, sign in, open `/ledger` in a window **≥ 1024px** — below `lg` the desktop gate
   hides everything and you will think the page is broken.
2. Add two accounts in different currencies (e.g. RSD personal, EUR savings). Confirm each
   shows its native amount with the reporting-currency equivalent secondary, and that the hero
   total equals the converted sum.
3. Untick `includeInTotal` on one — the hero total drops, the chip stays visible.
4. Change the reporting currency on Assumptions. Confirm the totals re-render and the stored
   `current_balance_minor` / `currency` values are **unchanged** in the DB (D15). Check directly
   in `supabase studio`, not just in the UI.
5. Seed a snapshot dated 40 days ago → the stale banner appears; today's → it does not.
6. `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/fx-refresh` → 200 and rows
   in `ledger_fx_rates`. Re-run → same row count (idempotent). Without the header → 401.
7. **Determinism (A3):** load Today twice against an unchanged snapshot set and confirm
   identical figures; then insert a *newer* snapshot and confirm a view pinned to the older
   `asOfDate` still shows the old numbers.
8. A4: change one account's real balance in Studio, open the reconcile panel, confirm the
   variance is right and a `ledger_balance_snapshots` row is written.
