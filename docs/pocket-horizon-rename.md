# Kapa umbrella: Pocket + Horizon, with a landing page at `/`

## Context

`apps/web` hosts two products, but the naming and URL tree still say otherwise: "Kapa"
means both the whole project *and* the expense tracker, `/` **is** the expense dashboard,
and the cashflow projector hangs off it at `/ledger/*` under an internal codename. The
only thing marking the two as peers is `AppSwitcher`, a two-tab control buried in one
app's header and the other's rail.

The original idea was to split them into **separate microfrontends**. That was assessed
and rejected — see *Appendix: why not microfrontends*. What the idea was actually after
is identity and a real entry point, which costs a fraction as much.

**Outcome — Kapa becomes the umbrella, each app gets its own name:**

```
KAPA  (project, repo, @kapa/* packages, design system)
├─ POCKET   — monthly spending-cap tracker        → /pocket/*
└─ HORIZON  — multi-currency cashflow projector   → /horizon/*
                                                  → /  landing + chooser
```

`/` becomes a public landing page: a branded pitch with a sign-in CTA when logged out, a
two-card chooser with live data when logged in. The installed PWA keeps opening straight
into Pocket via `start_url: '/pocket'`, so no phone user pays an extra tap — which
matters because Horizon is hard-gated to `lg`+ screens and would be a dead card on mobile
anyway.

## Decisions

**Naming.** "Kapa" is retained as the umbrella only. `@kapa/web`, `@kapa/ui`, the root
`kapa` package, `release-please-config.json`, and the repo name are **unchanged** — they
now correctly denote the project. Pocket and Horizon are English, so they read instantly
in both shipped locales (en, ru).

**The database is renamed too, with a known deploy window.** Migrations 0014/0015/0016
created `ledger_accounts`, `ledger_fx_rates`, `ledger_balance_snapshots` (added by the
now-completed Ledger Epic A, slice 5), and `households.ledger_reporting_currency`, plus
their constraints, indexes, policies and trigger. Migration `0017` renames all of them to
`horizon_*`. (`0016` is already taken by `ledger_balance_snapshots`, so the rename
migration is `0017`, not `0016` as an earlier draft of this plan assumed.)

This is the one part of the plan that is **not** backward compatible, and it breaks the
repo's standing migration rule. `.github/workflows/release-please.yml` runs
`supabase db push` **before** `vercel deploy --prod`, so between those two steps the
previously-deployed code queries tables that no longer exist — PostgREST returns 404 and
the Horizon screens error until the deploy lands (roughly 1–3 minutes, once).

Accepting that window is the right call here rather than an expand/contract dance across
two releases: this is a private, invite-only app with two users, `ALTER TABLE … RENAME`
is metadata-only so **no data moves and nothing is lost**, and the whole thing is
reversible by running the inverse `ALTER`s. Mitigations: ship the release when the app
isn't in use, and keep the rollback SQL to hand (below). Kapa's own tables (`expenses`,
`categories`, `budget_settings`) are untouched, so Pocket keeps working throughout —
only Horizon is affected.

The alternative, if the window is unacceptable: migration 0016 renames and leaves
backward-compatible views at the old names, then a 0017 in the *next* release drops them.
That doubles the work and forces updatable-view + RLS plumbing for a two-user app; not
recommended, but it's the escape hatch.

**Scope of the URL move.** Only product-specific screens move. Account-level screens stay
at the root, because both products share them — mirroring the DB, where `expenses`,
`categories`, `budget_settings` are Pocket-only while `households`, `profiles`,
`household_members` are shared (`lib/ledger/queries/settings.ts` already reads
`households.ledger_reporting_currency`).

| Now | After |
| --- | --- |
| `/` (expense home) | `/pocket` |
| `/add`, `/history`, `/cap`, `/categories`, `/edit/[id]` | `/pocket/...` |
| `/ledger`, `/ledger/*` | `/horizon`, `/horizon/*` |
| `/household`, `/settings`, `/login`, `/auth/*`, `/api/*` | unchanged (shared) |
| — | `/` = new landing page |

## Implementation

Three commits, in this order. Conventional Commits are CI-enforced on commits *and* PR
title. Cut fresh off updated `origin/main` — **note** the current branch
`feat/ledger-accounts-schema` (3 commits) is not merged yet; don't stack on it.

---

### Commit 1 — `refactor!: rename ledger to horizon`

Names only — no behaviour change — but it renames database objects, so the `!` marks the
break. On `@kapa/web`'s current `0.5.0`, release-please treats a breaking change on a
`0.x` package as a minor bump (`0.6.0`), which is the right signal for "this release
requires the migration to land with it".

**Paths** (`git mv` so history follows). Epic A shipped all 5 slices since this plan was
first drafted, so the tree is much bigger than the original inventory — this is the full
current list:

| From | To |
| --- | --- |
| `apps/web/src/app/ledger/{page,layout}.tsx` | `apps/web/src/app/horizon/{page,layout}.tsx` |
| `apps/web/src/app/ledger/{accounts,assumptions,money-in,money-out,scenarios,target-rate,timeline}/page.tsx` | `apps/web/src/app/horizon/.../page.tsx` (same sub-paths) |
| `apps/web/src/lib/ledger/{fx,mappers,today,types,validation}.ts` (+ `.test.ts` where present) | `apps/web/src/lib/horizon/...` |
| `apps/web/src/lib/ledger/queries/{accounts,balances,fx,settings}.ts` (+ `.test.ts` where present) | `apps/web/src/lib/horizon/queries/...` |
| `apps/web/src/lib/ledger/mutations/{accounts,balances,settings}.ts` (+ `.test.ts`) | `apps/web/src/lib/horizon/mutations/...` |
| `apps/web/src/components/ledger/LedgerRail.tsx` (+ `.test.tsx`) | `.../horizon/HorizonRail.tsx` |
| `apps/web/src/components/ledger/LedgerPlaceholder.tsx` | `.../horizon/HorizonPlaceholder.tsx` |
| `apps/web/src/components/ledger/accounts/{AccountForm,AccountList,ReconcilePanel}.tsx` (+ `.test.tsx` where present) | `.../horizon/accounts/...` |
| `apps/web/src/components/ledger/assumptions/{FxSnapshotTable,ReportingCurrencyPicker}.tsx` (+ `.test.tsx`) | `.../horizon/assumptions/...` |
| `apps/web/src/components/ledger/today/{AccountChips,HeroBalance,StaleRateBanner}.tsx` | `.../horizon/today/...` |
| `apps/web/src/app/actions/ledger-accounts.ts` (+ `.test.ts`) | `horizon-accounts.ts` |
| `apps/web/src/app/actions/ledger-balances.ts` (+ `.test.ts`) | `horizon-balances.ts` |
| `apps/web/src/app/actions/ledger-settings.ts` (+ `.test.ts`) | `horizon-settings.ts` |
| `apps/web/src/test/integration/ledger-accounts.itest.ts` | `horizon-accounts.itest.ts` |
| `apps/web/src/test/integration/ledger-balances.itest.ts` | `horizon-balances.itest.ts` |

**Code:** rename the `LedgerRail` / `LedgerPlaceholder` symbols and every import; update
`app/horizon/layout.tsx`'s typed-route generic `LayoutProps<'/ledger'>` →
`LayoutProps<'/horizon'>` and every other typed-route generic under the renamed tree
(`/ledger/accounts`, `/ledger/assumptions`, etc.); `revalidatePath('/ledger')` → `'/horizon'`
and `revalidatePath('/ledger/accounts')` → `'/horizon/accounts'` in the renamed action
files; `LedgerRail`'s nav hrefs and its `/ledger/assumptions` link. Also rename the
`LedgerAccount` type (and the `ledgerAccount()` builder that constructs it) in
`apps/web/src/test/factories.ts` → `HorizonAccount` / `horizonAccount()`, and update every
call site.

**Leave alone:** `/api/fx-refresh` — the name is product-neutral and its `vercel.json`
cron path stays valid.

**Database — new migration `supabase/migrations/0017_rename_ledger_to_horizon.sql`.**
All metadata-only renames; no data movement. `ALTER TABLE … RENAME TO` carries data,
grants, RLS-enabled state, and foreign keys across automatically — but *not* the names of
constraints, indexes, policies, or triggers, so each is renamed explicitly. This now also
covers `ledger_balance_snapshots` (0016), added by Epic A slice 5 after this plan was
first drafted:

```sql
alter table public.ledger_accounts          rename to horizon_accounts;
alter table public.ledger_fx_rates          rename to horizon_fx_rates;
alter table public.ledger_balance_snapshots rename to horizon_balance_snapshots;

-- horizon_accounts: pkey, fkey, 3 checks, 1 index, 1 trigger, 4 policies
alter table public.horizon_accounts rename constraint ledger_accounts_pkey
  to horizon_accounts_pkey;
alter table public.horizon_accounts rename constraint ledger_accounts_household_id_fkey
  to horizon_accounts_household_id_fkey;
alter table public.horizon_accounts rename constraint ledger_accounts_currency_allowed
  to horizon_accounts_currency_allowed;
alter table public.horizon_accounts rename constraint ledger_accounts_type_allowed
  to horizon_accounts_type_allowed;
alter table public.horizon_accounts rename constraint ledger_accounts_name_len
  to horizon_accounts_name_len;
alter index public.ledger_accounts_household_idx
  rename to horizon_accounts_household_idx;
alter trigger ledger_accounts_touch_updated_at on public.horizon_accounts
  rename to horizon_accounts_touch_updated_at;
alter policy "ledger_accounts_select" on public.horizon_accounts
  rename to "horizon_accounts_select";
-- …likewise _insert, _update, _delete

-- horizon_fx_rates: pkey, rate check, 3 checks, 1 policy
alter table public.horizon_fx_rates rename constraint ledger_fx_rates_pkey
  to horizon_fx_rates_pkey;
alter table public.horizon_fx_rates rename constraint ledger_fx_rates_rate_e8_check
  to horizon_fx_rates_rate_e8_check;
-- …likewise _base_allowed, _quote_allowed, _distinct
alter policy "ledger_fx_rates_select" on public.horizon_fx_rates
  rename to "horizon_fx_rates_select";

-- horizon_balance_snapshots: pkey, 2 fkeys (household_id, account_id), 1 check,
-- 2 indexes, 4 policies
alter table public.horizon_balance_snapshots rename constraint ledger_balance_snapshots_pkey
  to horizon_balance_snapshots_pkey;
alter table public.horizon_balance_snapshots rename constraint ledger_balance_snapshots_household_id_fkey
  to horizon_balance_snapshots_household_id_fkey;
alter table public.horizon_balance_snapshots rename constraint ledger_balance_snapshots_account_id_fkey
  to horizon_balance_snapshots_account_id_fkey;
alter table public.horizon_balance_snapshots rename constraint ledger_balance_snapshots_currency_allowed
  to horizon_balance_snapshots_currency_allowed;
alter index public.ledger_balance_snapshots_household_idx
  rename to horizon_balance_snapshots_household_idx;
alter index public.ledger_balance_snapshots_account_idx
  rename to horizon_balance_snapshots_account_idx;
alter policy "ledger_balance_snapshots_select" on public.horizon_balance_snapshots
  rename to "horizon_balance_snapshots_select";
-- …likewise _insert, _update, _delete

-- shared households column
alter table public.households
  rename column ledger_reporting_currency to horizon_reporting_currency;
alter table public.households
  rename constraint households_ledger_reporting_currency_allowed
  to households_horizon_reporting_currency_allowed;
```

Verify the auto-generated constraint names first (`\d+ public.ledger_accounts`,
`\d+ public.ledger_fx_rates`, `\d+ public.ledger_balance_snapshots` in `supabase db
psql`) — the `_pkey`/`_fkey`/`_check` names above are Postgres defaults and should match,
but confirm rather than assume, especially the two FKs on `ledger_balance_snapshots`
(`household_id`, `account_id` — Postgres names multi-FK tables' constraints in
declaration order, so double-check which is which). Head the migration with a comment
stating it **deliberately breaks** the additive-migration rule and why (see Decisions).

Keep the exact inverse SQL in the PR description as rollback.

**Downstream of the migration:**

- `apps/web/src/lib/horizon/queries/{accounts,balances,fx,settings}.ts`,
  `mutations/{accounts,balances,settings}.ts`, `today.ts` — `.from('ledger_accounts')` →
  `'horizon_accounts'`, `.from('ledger_fx_rates')` → `'horizon_fx_rates'`,
  `.from('ledger_balance_snapshots')` → `'horizon_balance_snapshots'`, and the
  `ledger_reporting_currency` field → `horizon_reporting_currency` (read/written in
  `queries/settings.ts` and `mutations/settings.ts`). Update the corresponding `.test.ts`
  files' `db.seed('ledger_accounts', …)` / `db.rows('ledger_accounts')` calls too — the
  fake Supabase test double keys its in-memory tables by string name, so a missed rename
  there fails silently at runtime, not at typecheck.
- `apps/web/src/app/api/fx-refresh/route.ts` (+ `.test.ts`) — its service-role write
  target `ledger_fx_rates` → `horizon_fx_rates`.
- `apps/web/src/lib/supabase/service-role.ts` — doc comment references `ledger_fx_rates`
  and `0015_ledger_fx_rates.sql`; update the table name, leave the migration filename
  (migrations already shipped keep their historical names).
- `apps/web/src/test/fake-supabase.ts` — one comment mentions `ledger_fx_rates` as an
  example of composite-key upsert semantics; update the name.
- Regenerate types: `pnpm gen:types` → `apps/web/src/lib/supabase/database.types.ts`.
  CI gates this with `git diff --exit-code`, so a stale file fails the build.
- pgTAP: `git mv supabase/tests/database/ledger_accounts.sql` → `horizon_accounts.sql`,
  same for `ledger_fx_rates.sql` and `ledger_balance_snapshots.sql`; update the table,
  constraint, index, and policy names asserted inside all three, plus each file's header
  comment (`-- pgTAP RLS isolation suite for ledger_balance_snapshots
  (0016_ledger_balance_snapshots.sql)` — update the table name, leave the migration
  filename reference since 0016 itself isn't renamed).

**i18n:** rename the `Ledger` namespace → `Horizon` in `apps/web/messages/{en,ru}.json`.
The namespace has grown substantially since this plan was drafted — it now covers
`meta`, `rail`, `gate` (including `backToKapa` → `backToPocket`, folded into Commit 2's
back-link work), `placeholder`, `today`, `accounts`, and `assumptions` sub-keys in both
locale files. Update `CLIENT_MESSAGE_NAMESPACES` in `apps/web/src/app/layout.tsx`
(`'Ledger'` → `'Horizon'`) and every `useTranslations('Ledger')` /
`getTranslations('Ledger')` call across the renamed `app/horizon` and
`components/horizon` trees. Sweep user-facing "Ledger" strings to "Horizon".

**Docs:** `git mv docs/ledger-epic-a-plan.md docs/horizon-epic-a-plan.md` and
`docs/ledger-user-stories.md` → `docs/horizon-user-stories.md`; sweep their bodies
(including the `ledger_*` table names in the Epic A plan's schema sections) and update
`PLAN.md` §9's references, including its migration-number mentions (0014–0016 stay as
historical migration filenames; the new rename migration is 0017). Epic A's status is
already recorded as "completed, all 5 slices shipped" at the top of
`ledger-epic-a-plan.md`, so the two stale claims an earlier pass of this plan flagged
(`feat/ledger-shell` unmerged, slice board not reflecting slices 1–3) no longer apply —
no further correction needed there beyond the rename itself.

---

### Commit 2 — `refactor: rename kapa app to pocket and move to /pocket`

**Paths:**

| From | To |
| --- | --- |
| `apps/web/src/app/(kapa)/` | `apps/web/src/app/pocket/` |
| `apps/web/src/components/kapa/` | `apps/web/src/components/pocket/` |
| `apps/web/src/lib/kapa-math.ts` (+ `.test.ts`) | `apps/web/src/lib/pocket-math.ts` |

The route group's parens disappear — the directory name now *is* the URL segment. This
also frees `/` for commit 3. `app/pocket/layout.tsx` is metadata-only (`generateMetadata`
+ `return children`); only its generic changes, `LayoutProps<'/'>` →
`LayoutProps<'/pocket'>`.

**Links and redirects** — complete inventory (from `href=`, `router.push(`,
`revalidatePath(`, `backHref` greps):

- `app/pocket/page.tsx` — `/cap` ×2, `/add`, `/history` → `/pocket/...`
- `components/layout/AppHeader.tsx` — wordmark `Kapa` → `Pocket`; `links` array `/cap`,
  `/categories` → `/pocket/...` (leave `/household`, `/settings`)
- `components/layout/AppSwitcher.tsx` — `App` type `'kapa' | 'ledger'` →
  `'pocket' | 'horizon'`; hrefs `/` → `/pocket`, `/ledger` → `/horizon`; the
  `hidden lg:inline-flex` gate on the Horizon tab stays as-is
- `app/horizon/layout.tsx` — the back button `/` → `/pocket` (`Horizon.gate.backToKapa`
  key → `backToPocket`)
- `components/pocket/history/CategoryFilter.tsx` — `/history` and
  `` `/history?category=${c.id}` `` → `/pocket/history`
- `components/pocket/home/HistoryList.tsx:166` — `` `/edit/${e.id}` `` → `/pocket/edit/...`
- `components/pocket/add/AddExpenseForm.tsx:91` — `editing ? '/history' : '/'` →
  `'/pocket/history' : '/pocket'`
- `components/pocket/cap/SetCapForm.tsx:56` — `router.push('/')` → `'/pocket'`
- `app/pocket/edit/[id]/{page,loading}.tsx` — `backHref="/history"` → `/pocket/history`
- `app/actions/{cap,categories,expenses,household,profile}.ts` — `revalidatePath('/')` →
  `'/pocket'`, `'/history'` → `'/pocket/history'`, `'/categories'` →
  `'/pocket/categories'`. Leave `'/household'` and `'/settings'`. Leave
  `profile.ts:70`'s `revalidatePath('/', 'layout')` **as-is** — it targets the whole root
  layout subtree (locale change) and still covers everything.

**Back-link defaults:** `components/ui/PageHeader.tsx` and `PageLoadingShell.tsx` both
default `backHref = '/'`. Change the default to `'/pocket'` (7 of 8 call sites are Pocket
pages) and pass `backHref="/"` explicitly in `app/settings/{page,loading}.tsx`, so the
shared settings screen backs out to the chooser.

**Leave pointing at `/`** — these now correctly land on the chooser: `app/error.tsx:45`,
`app/not-found.tsx:17`, `components/auth/LoginForm.tsx:30` (post-login the user picks),
and `app/auth/callback/route.ts:19` (`next ?? '/'`).

**PWA:** `app/manifest.ts` — `start_url: '/'` → `'/pocket'`, `name`/`short_name` →
Pocket. `InstallPrompt` is rendered by the Pocket home and moves with it.

**i18n:** rename the `Meta` namespace → `Pocket.meta` for symmetry with `Horizon.meta`;
`Nav.kapa`/`Nav.ledger` → `Nav.pocket`/`Nav.horizon`; sweep every user-facing "Kapa"
string (`Meta.title`, `appleWebAppTitle`, `Home.pageTitle`, the `PWA` namespace's
`installTitle`/`title`) in **both** `en.json` and `ru.json`. Serbian is unstarted, so two
files.

---

### Commit 3 — `feat: add kapa landing page at /`

New `apps/web/src/app/page.tsx`, a **server component**, and the first public page: it
calls `verifySession()` but does *not* `redirect('/login')` on null.

- **Logged out:** Kapa wordmark, one-line pitch per product, primary CTA to `/login`.
  Product cards non-interactive.
- **Logged in:** two linked cards. Pocket → `/pocket` showing this month's remaining via
  `getSummary` (`lib/queries/summary.ts`) + `formatMoney` (`lib/format.ts`). Horizon →
  `/horizon` showing the reporting-currency total via `summarizeToday`
  (`lib/horizon/today.ts`) — the same call `app/horizon/page.tsx` already makes.
- **Mobile:** the Horizon card renders but is marked desktop-only and does not link.
  Keep it **CSS-only** (`hidden lg:` / `lg:hidden`), no viewport JS — the precedent set by
  `AppSwitcher` and `app/horizon/layout.tsx`.
- `generateMetadata` off a new `Landing` namespace in both message files. Keep the page a
  server component so nothing needs adding to `CLIENT_MESSAGE_NAMESPACES`.

**Reuse, don't rebuild:** `components/ui/Button.tsx` for CTAs and card links; Tailwind
utilities against `@kapa/ui` tokens only — no new CSS, no `@theme` block in the app (per
`docs/tokens-only-migration.md`).

**Docs:** update `PLAN.md`'s architecture note (currently *"Kapa lives in `app/(kapa)` (a
route group — URLs unchanged)"* — now false) and its Ledger section, plus `README.md`'s
description and any route list. Run `graphify update .` per `CLAUDE.md`.

## Verification

No business logic changes in any of the three commits — only names, paths, and URLs — so
the unit, pgTAP, and integration suites should pass once their imports and identifiers are
updated.

```bash
supabase db reset          # replays 0001–0017 from scratch onto a clean DB
pnpm gen:types && git diff --exit-code -- apps/web/src/lib/supabase/database.types.ts
pnpm test:db               # pgTAP against the renamed tables
pnpm test:integration
pnpm format:check && pnpm lint && pnpm knip && pnpm typecheck && pnpm test && pnpm build
```

`supabase db reset` is the important one — it proves 0017 applies cleanly in sequence,
which is exactly what `supabase db push` will do in production. `knip` matters because
renames orphan files easily; `typecheck` catches broken Next 16 typed routes
(`LayoutProps<'/pocket'>`, `LayoutProps<'/horizon'>`).

Then confirm nothing was missed:

```bash
grep -rn "ledger\|Ledger" apps/web/src supabase docs   # must be empty
grep -rni "kapa" apps/web/src                          # only @kapa/ui imports survive
```

**Before pushing the release**, dry-run the migration against a copy of production — restore
the latest dump from the `kapa-backups` repo into a scratch Supabase project, run
`supabase db push`, and confirm the renames apply and the row counts are unchanged. This
migration is the one in this repo's history that most warrants it.

Then by hand against real Supabase (`pnpm dev`) — compile-green ≠ working, the lesson
recorded in `PLAN.md`:

1. Logged out, visit `/` → landing renders, **no** redirect to `/login`; CTA works.
2. Sign in → lands on `/` chooser → both cards show live numbers.
3. Pocket card → `/pocket` renders. Walk `/pocket/add` (save → returns to `/pocket`),
   `/pocket/history` → category filter → edit an expense (Back → `/pocket/history`),
   `/pocket/cap` (save → returns to `/pocket`), `/pocket/categories`.
4. Header menu → `/household` and `/settings` still work; settings' Back → `/`.
5. Horizon card → `/horizon` → accounts screen loads **pre-existing** rows (proves the
   rename carried data, not just schema), add and archive an account (proves the renamed
   RLS policies still admit writes) → rail's back link → `/pocket`.
6. Narrow below `lg` on `/` → Horizon card is marked desktop-only and not clickable;
   `/horizon` still shows its gate.
7. Add an expense → `/pocket` and `/pocket/history` both reflect it without a hard reload
   (revalidate paths are correct).
8. Switch locale to ru → no raw message keys anywhere on `/`, `/pocket`, `/horizon`.
9. DevTools → Application → Manifest: `start_url` is `/pocket`, name is Pocket. Reinstall
   the PWA, cold launch → opens Pocket, not the chooser.
10. Hit `/api/fx-refresh` with `CRON_SECRET` → still writes `horizon_fx_rates` (proves
    the service-role grant survived the rename), and `/horizon` no longer shows a stale-
    rate banner.
11. Change the reporting currency on `/horizon/assumptions` (or wherever
    `horizon_reporting_currency` is written) → the Horizon total re-denominates, proving
    the renamed `households` column round-trips.

---

## Appendix: why not microfrontends

Recorded so it doesn't get re-litigated.

**It would work.** The seam is unusually clean — the projector is a separate route
subtree with its own layout, its own `lib/` namespace, its own tables, and *zero*
cross-imports with the tracker. Auth is per-page (`lib/auth/dal.ts`), not in a layout,
which a split would otherwise fight. Vercel Hobby includes 2 microfrontend projects and
50K routed requests/month, so it fits the free tier.

**But the cost/benefit is wrong at this size.** Microfrontends buy independent build
times, independent teams, and independent release cadence. This is a solo, invite-only
app that builds in seconds and ships both products from one branch. Horizon has grown
since this was first assessed — Epic A shipped real content behind Today, Accounts, and
Assumptions — but 5 of its 8 routes (Timeline, Money in, Money out, Scenarios, Target
rate) are still placeholders, so the two products remain far apart in size. The bill: duplicate the
root shell (`app/layout.tsx` — fonts, `NextIntlClientProvider` and its hardcoded
namespace allowlist, `ToastProvider`, `OfflineBanner`, Analytics), split
`messages/{en,ru}.json`, extract `components/ui/*` + `lib/supabase` + `lib/auth` +
`lib/types` + `database.types.ts` into packages with real build steps, two Vercel projects
and two env sets, a local dev proxy, two release-please units, and `AppSwitcher`'s two
`next/link` calls become cross-zone hard navigations.

**And the domains are converging, not separating.** `docs/horizon-user-stories.md:75`
gives Horizon a `DailyExpense` with a `cap`; `PLAN.md:317` states it "will **read Kapa's
`expenses` table for daily actuals**." A deployment boundary would harden a wall exactly
where a shared spend model is about to be wanted.

This plan delivers the product separation the idea was really after — distinct names,
distinct URL trees, a real front door — at a fraction of the cost, and leaves the
microfrontend option open. Extracting shared code into `packages/*` is the actual
prerequisite, and it's worth doing on its own merits if build times ever justify it.
