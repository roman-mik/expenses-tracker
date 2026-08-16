## Architecture

**Overall assessment.** This is a well-layered small app. The intended stack — page/route → action/handler → `src/lib/{queries,mutations}` → injected Supabase client — is real, mostly followed, and pays off in testability: every query/mutation takes the client as its first argument, so the in-memory `fake-supabase` harness exercises them without module mocking (192 tests, all green, ~1.2s). Domain math (`kapa-math`) is genuinely pure and well tested. The main weaknesses are (a) one route handler that bypasses the mutation layer and hand-rolls its own SQL, (b) a repeated 8-line auth/household preamble copy-pasted across 8 Server Actions and 8 pages with no shared helper on the non-HTTP side, (c) `getSummary` re-implementing logic that already exists in `queries/cap.ts` and `category-breakdown.ts`, and (d) Server Actions swallowing every error with a bare `catch {}` — no logging at all, in contrast to the route handlers. The dual Server-Action/REST surface is deliberate and documented (PLAN.md:153), but the REST half has drifted: it is neither complete relative to the actions nor guarded against divergence.

### Route handler bypasses the mutation layer and duplicates it

**Severity: High**

`src/lib/mutations/expenses.ts:56-80` (`updateExpense`) and `:86-101` (`deleteExpense`) exist and are used by the Server Actions (`src/app/actions/expenses.ts:61`, `:87`). But `src/app/api/expenses/[id]/route.ts:18-39` and `:50-56` re-implement exactly the same patch-building, `.eq('id').eq('household_id')` scoping, column list and `maybeSingle()` handling inline against `ctx.supabase`. The column list is even duplicated as a string literal (`route.ts:31` vs the `EXPENSE_COLUMNS` constant at `mutations/expenses.ts:11-12`), and the "currency is never patched" invariant is now asserted in two comments in two files. Every other route handler in the app (`api/cap/route.ts`, `api/categories/route.ts`, `api/categories/[id]/route.ts`, `api/expenses/route.ts`) correctly delegates — this one file is the sole layering violation.

*Recommendation:* replace the bodies of `PATCH`/`DELETE` with calls to `updateExpense` / `deleteExpense`, mapping `null`/`false` to `notFound()` and a thrown error to the 500, exactly as `api/categories/[id]/route.ts:17-28` does.

### `getSummary` re-implements `getCap` and `categoryBreakdown`

**Severity: Medium**

`src/lib/queries/summary.ts:38-42` inlines a `budget_settings` select that is character-for-character the one in `src/lib/queries/cap.ts:13-17`, and `:61-78` recomputes a per-category total map that `src/lib/category-breakdown.ts:7-19` already provides (same "skip rows in another currency" rule, same output shape `{categoryId, spent}[]`) — the two are used on different screens (`/api/summary` + home vs `/history`) and can silently drift. `summary.ts` also does its own `expenses` select (`:51-56`) rather than reusing `listExpenses` with the same month window.

*Recommendation:* have `getSummary` call `getCap(supabase, householdId)` and build the breakdown by mapping `listExpenses(...)` through `categoryBreakdown(...)`. If the wide select is a deliberate perf choice, at minimum route the totals through `categoryBreakdown` so the aggregation rule lives once. Note `category-breakdown.ts` sorts by descending spend while `summary.ts:101-104` does not — that difference is already an observable inconsistency between the two screens.

### `createExpense` reads `households` directly, bypassing the cached query

**Severity: Medium**

`src/lib/mutations/expenses.ts:22-29` issues its own `from('households').select('currency')` with a hardcoded `?? 'RSD'` fallback. `src/lib/queries/household.ts:19-33` (`getHousehold`) already does exactly this, is `cache()`-wrapped so it collapses with the reads the same request already performed, and carries the *same* `'RSD'` default at `:30`. So the default currency is now specified in two places, and a mutation module reaches into the DB for a read the query layer owns.

*Recommendation:* `const { currency } = await getHousehold(supabase, householdId);` and delete the local fallback.

### The auth + household preamble is duplicated 16 times with no non-HTTP helper

**Severity: Medium**

`src/lib/api/http.ts:61-82` (`requireHousehold`) solves this cleanly — but only for route handlers, because it returns `NextResponse`. Consequently:

- All 8 Server Actions repeat `verifySession()` → `if (!user) return {ok:false,...}` → `getHouseholdId(user.id)` → `if (!householdId) throw` → `createClient()` inside a `try`: `actions/expenses.ts:21-32`, `:51-60`, `:79-87`; `actions/categories.ts:21-32`, `:52-61`, `:85-92`; `actions/cap.ts:16-27`.
- All 8 pages repeat `verifySession()` → `redirect('/login')` → `getHouseholdId` → `redirect('/login')` → `createClient()`: `app/page.tsx:24-30`, `app/add/page.tsx:13-19`, `app/cap/page.tsx:13-19`, `app/categories/page.tsx:10-16`, `app/edit/[id]/page.tsx:18-26`, `app/history/page.tsx:21-27`, plus `household/page.tsx` and `settings/page.tsx`.

That is 16 copies of an authorization decision. It is currently correct everywhere (I checked each), but "correct at every one of 16 hand-written sites" is exactly the invariant that breaks when screen #9 is added.

*Recommendation:* factor two thin siblings next to `requireHousehold` — e.g. `requireHouseholdForPage()` (redirects) and `requireHouseholdForAction()` returning `{ok:false,error}|{user,householdId,supabase}` — so all three entry-point kinds share one authorization implementation.

### Server Actions swallow all errors silently

**Severity: Medium**

Every action ends in a bare `catch { return { ok: false, error: t('saveFailed') } }` — `actions/expenses.ts:33-35`, `:68-70`, `:89-91`; `actions/categories.ts:33-35`, `:69-71`, `:93-95`; `actions/cap.ts:28-30`; `actions/profile.ts:30-32`, `:57-59`. No `console.error`, no error binding at all. The route handlers do the opposite and log consistently (`api/cap/route.ts:15`, `api/expenses/route.ts:28`, `api/household/join/route.ts:32`, `lib/api/http.ts:74`). Since the UI exclusively uses actions for writes (only `HouseholdPanel.tsx:32,60` uses `fetch`), this means **the production write path is the one with zero observability**: a Supabase constraint failure and a network blip are indistinguishable in the logs, because neither appears.

*Recommendation:* `catch (error) { console.error('addExpense failed', error); ... }` in every action, mirroring the handlers. Better still, fold it into the shared action helper above.

### The REST surface is an incomplete, untested-for-drift mirror of the actions

**Severity: Medium**

PLAN.md:153 states the dual path is intentional (`/api/*` is the contract for a future Expo app; the web app uses Server Actions except for household invite/join). Accepting that, the mirror is nonetheless partial and asymmetric:

- Actions with no REST equivalent: `moveCategory` (`actions/categories.ts:80`), `setDisplayName` and `setLocale` (`actions/profile.ts:19`, `:47`) — there is no `/api/profile` or category-reorder endpoint at all.
- REST endpoints with no action equivalent: `GET /api/summary`, `GET /api/expenses`, `GET /api/categories`, `GET /api/cap` (reads go through `src/lib/queries/*` in Server Components instead).
- Nothing enforces that the two paths agree. `POST /api/expenses` and `addExpense` share `createExpense`, so they do; `PATCH /api/expenses/[id]` and `updateExpense` do *not* share code (see the High finding) and could diverge undetected.
- Error copy diverges by design accident: actions return `next-intl`-translated messages (`getTranslations('Errors')`), route handlers return hardcoded English (`'Failed to load expenses'`). A mobile client consuming `/api/*` gets an untranslatable string body with no error code to key off.

*Recommendation:* pick one of (a) finish the mirror and add a small contract test asserting each action and its REST twin call the same mutation, or (b) explicitly scope `/api/*` to what the mobile app will actually need and delete the rest until then. Also give handler errors a stable machine-readable `code` field so clients can localize.

### `expenseUpdateSchema` accepts an empty patch

**Severity: Medium**

`src/lib/validation.ts:23` is `expenseCreateSchema.partial()` with no non-empty guard, while `categoryUpdateSchema` (`:37-43`) explicitly `.refine((v) => Object.keys(v).length > 0, 'No changes given.')`. So `PATCH /api/expenses/:id` with `{}` passes validation, builds an empty `patch` object (`api/expenses/[id]/route.ts:18-22` / `mutations/expenses.ts:64-68`), and hands `.update({})` to PostgREST — which surfaces as a 500 "Failed to update the expense", not a 400. The same hole exists via `updateExpense` action (`actions/expenses.ts:54`).

*Recommendation:* add the same `.refine` to `expenseUpdateSchema`.

### Unvalidated `category` query parameter

**Severity: Low**

`src/app/api/expenses/route.ts:12,24` reads `searchParams.get('category')` and passes it straight into `listExpenses` → `.eq('category_id', categoryId)`, while the sibling `month` param *is* schema-checked (`:16-19`). `validation.ts` has `z.string().uuid()` available (it uses it at `:18`). Not a security hole — PostgREST parameterizes and RLS scopes the row set — but a malformed uuid becomes a 500 (`22P02 invalid input syntax`) instead of a 400, and it's the one boundary input in the app with no schema. Contrast `history/page.tsx:47-50`, which *does* defensively validate the category against the fetched list.

*Recommendation:* wrap it in `z.string().uuid().optional()` and return `badRequest` on failure.

### `attribution.ts` embeds English UI copy in a domain module

**Severity: Medium**

`src/lib/attribution.ts:9-10` returns the literals `'you'` and `'partner'`, and those values are rendered verbatim — `TodayList.tsx:27-29,45` and `HistoryList.tsx:63-66,97`. Phase 7 localized the rest of the app (`messages/en.json`, `messages/ru.json`), and `en.json:139-141` even has `you`/`youSuffix` keys, so a Russian-locale user sees "· you" / "· partner" in the expense lists. Architecturally this is the same mistake `date.ts:56-63` deliberately avoids — `dayLabel` takes `labels: {today, yesterday}` as a parameter precisely to stay framework-agnostic.

*Recommendation:* follow the `dayLabel` precedent — pass `{ you, partner }` in from the caller. This module also has **no test file**, the only pure domain module without one.

### `proxy.ts` runs a network auth round-trip on every request, including `/api/*`

**Severity: Low**

`src/proxy.ts:31` calls `supabase.auth.getUser()` (a network call to the Auth server) and the matcher at `:36-39` excludes only static assets — so it fires on every API request and every page, and is then followed by the DAL's `verifySession()` → `getClaims()` (`auth/dal.ts:26`). `dal.ts:18-22` explains at length that `getClaims` was chosen to avoid exactly this round-trip on the hot path, and then the proxy reintroduces it one layer up. It also runs on `/api/keepalive`, which authenticates via `CRON_SECRET` and has no session at all (`api/keepalive/route.ts:12-15`).

*Recommendation:* keep the refresh (it is what keeps the cookie alive) but narrow the matcher to exclude `/api/keepalive` and `/auth/*`, and consider `getClaims()` here too.

### Duplicated `ActionResult` type and a cross-file type import

**Severity: Low**

`ActionResult` is declared identically in two places — `app/actions/expenses.ts:14` and `app/actions/categories.ts:14` — and `actions/cap.ts:9` and `actions/profile.ts:13` import it *from the expenses action module* (`import type { ActionResult } from './expenses'`). A shared result type living inside one feature's action file is an accidental dependency: `cap.ts` now imports from `expenses.ts` for no domain reason.

*Recommendation:* move `ActionResult` to `src/lib/types.ts` or a new `src/app/actions/types.ts`, and delete the duplicate.

### Dead code: `getUser` alias

**Severity: Nit**

`src/lib/auth/dal.ts:33` exports `getUser = verifySession` "for readability at call sites" — nothing imports it (the only `getUser` references in the repo are `proxy.ts:31`'s Supabase call and the doc comments at `dal.ts:18,21`, which makes the alias actively confusing given the comment right above explains why `getUser()` is *not* used).

*Recommendation:* delete it.

### `Money` brand type is declared but not enforced

**Severity: Nit**

`src/lib/types.ts:17` defines a branded `Money` and `:19-23` the exponent table, but the brand is applied only via an unchecked cast (`mappers.ts:33` `const money = (n: number): Money => n as Money`) and the whole `Summary` interface (`types.ts:76-94`) types `cap`, `spent`, `remaining`, `safeDaily`, `evenPace`, `paceGap`, `projection`, `overspend` and `categoryBreakdown[].spent` as plain `number`. `kapa-math` likewise takes and returns `number`. `summary.ts:105-108` even casts back into the brand (`s as CurrencyBucket['spent']`). So the brand buys nothing today — it just adds casts.

*Recommendation:* either thread `Money` through `kapa-math` and `Summary` so it actually prevents mixing, or drop it and keep the "integer minor units" contract as a documented convention.

### Test strategy: good harness, specific gaps and two brittle spots

**Severity: Medium**

The `fake-supabase` harness (`src/test/fake-supabase.ts`) is the right call — dependency injection over module mocking, an honest scope note at `:10-12`, and it makes query/mutation tests read like integration tests. Factories (`src/test/factories.ts`) are clean. Two harness problems and several coverage gaps:

- **Loose upsert matching.** `fake-supabase.ts:215-219` finds the "existing" row via `Object.keys(payload).some((k) => r[k] !== undefined && r[k] === payload[k])` — *any* shared value matches, not the conflict key. With two `budget_settings` rows that happen to share a `monthly_cap` or `nudge_pct`, an upsert would update the wrong household's row and the test would still pass. Take `onConflict` (already accepted and ignored at `:139`) and match on that column.
- **`failNext` doesn't match its own contract.** The comment at `:23` documents `table -> mode -> message`, but `errors` is `Map<string, string>` keyed on table only (`:24`), so a forced error can't be aimed at, say, the update in a read-then-write mutation like `moveCategory` (`mutations/categories.ts:87-117`). Either implement the mode key or fix the comment.
- **`.single()` on a filtered multi-row result** returns `{data: rows[0]}` only for `maybeSingle`; `single()` errors unless exactly one row matched (`:178-182`) — which is right, but combined with the ignored `select(_cols)` (`:98-100`) it means no test can catch a wrong column list. `api/expenses/[id]/route.ts:31`'s hand-copied column string is therefore untestable — another argument for the High finding.
- **Untested modules:** `src/lib/mappers.ts` (every row→domain conversion, including the unchecked `as Currency` / `as Locale` casts), `src/lib/attribution.ts`, `src/lib/queries/profile.ts`, `src/lib/mutations/profile.ts`, `src/app/actions/profile.ts` (the largest action file at 93 lines — `setLocale`'s cookie write and `syncLocaleCookie` are entirely uncovered), `src/app/auth/callback/route.ts` (the "registration closed" path at `:26-28` and the locale-cookie seed at `:34-41`), `src/app/auth/signout/route.ts`, `src/app/api/keepalive/route.ts` (its `CRON_SECRET` check at `:13` is the only bespoke auth in the app), and `src/proxy.ts`.
- **No contract test** pinning REST and action twins to the same behavior (see the REST-surface finding).

*Recommendation:* fix the upsert key first (it can produce false greens), then cover `actions/profile.ts` and `auth/callback/route.ts` — both are auth/session-adjacent and currently have zero tests.

### Coupling and naming nits

**Severity: Nit**

- `requireHousehold` maps *both* "not signed in" and "signed in but no household" to 401 (`lib/api/http.ts:66,70`). Documented at `:53-57`, and defensible, but the second case is a server-side data invariant violation (`handle_new_user` should guarantee membership), not an authentication failure — a 500 would be more honest and would surface the bug instead of hiding it as a login prompt. The actions treat the same case as `throw` → generic save-failed (`actions/expenses.ts:30`), so the two paths already disagree about what it means.
- `mappers.ts:1-5`'s header comment says "When `npm run gen:types` is wired up, swap the local Row interfaces below" — that already happened (`:17-31` derive from `Database`). Stale comment.
- `queries/expenses.ts` holds both `listExpenses` and `getExpense`, while `mutations/expenses.ts` holds create/update/delete — consistent and good; `mutations/household.ts` mixes an invite-code generator (`:10-12`, a pure function) in with the DB calls. Minor.

## What's done well

- **Injectable Supabase client.** Every function in `queries/` and `mutations/` takes the client as its first parameter — the single decision that makes the whole test suite possible without module mocking.
- **`kapa-math.ts` is genuinely pure.** No I/O, no framework imports, one documented convention for `daysLeft` (`:7-16`) that explains where it deviates from PLAN.md and why, and 184 lines of tests against it.
- **Row→domain mapping at the edge.** `mappers.ts` keeps snake_case out of the domain and UI entirely; `SupabaseServerClient` (`supabase/types.ts`) avoids re-deriving the generic everywhere.
- **`requireHousehold`** is the right abstraction for handlers, and every route handler uses it (`api/household/join/route.ts` correctly opts out since joining is the one operation that precedes having the target household).
- **DAL placement is correct and well justified** — `dal.ts:1-8` explains why authorization lives next to the data and not in the proxy or a layout, and every page and handler actually honors it.
- **`getHousehold` and `verifySession` are `cache()`-wrapped** with a comment explaining the request-scoped dedup (`queries/household.ts:11-18`), which is why `app/page.tsx:39-44` can fan out four parallel queries without N household reads.
- **Currency is server-stamped, never client-supplied** (`validation.ts:4-7`, `mutations/expenses.ts:29`) — the right instinct, documented at the schema.
- **Consistent typed results:** queries/mutations `throw` on DB errors and return `null`/`false` for "not found in this household"; callers translate that into 404 / friendly copy. The convention holds across every module.
- **Comments explain *why*, not *what*** — `supabase/server.ts:6-9` on not catching `DynamicServerError`, `api/household/join/route.ts:7-11` on which RPC errors are 400 vs 500, `date.ts:52-55` on keeping next-intl out of the module. This is unusually good.
