## API Contract

**Overall assessment.** As an internal convenience layer the `/api/*` surface is tidy: one auth preamble (`requireHousehold`), zod at every boundary, `.maybeSingle()` discipline, correct 404-vs-500 separation, and a real test file per route. As a *forward-looking client contract for an Expo app* it is not fit for purpose, and the gap is not a list of polish items — it is structural. **The current auth path cannot authenticate a bearer-token client at all** (§1): every endpoint returns 401 to a non-browser caller today. On top of that the surface is a partial mirror of the Server Actions (no profile, no category reorder, no single-expense read), the error envelope is human English prose with no machine code, `/api/expenses` has no pagination and will silently truncate at PostgREST's row cap, and **the household timezone — the single value a remote client needs most — is never exposed on any endpoint**, even though every month boundary on the server is computed from it.

The good news is that fixing all of that is mostly unnecessary, because the layer itself is close to redundant. See below.

---

## Strategic question: keep or delete the REST layer

**Recommendation: delete it.** Have the Expo client talk to Supabase directly via `supabase-js`, and ship `lib/kapa-math.ts`, `lib/mappers.ts`, `lib/queries/*` and `lib/validation.ts` as a shared TypeScript package. Keep exactly two HTTP endpoints (`/api/keepalive`, plus whatever the web `HouseholdPanel` needs until it moves to Server Actions). Revisit only when a genuine server-side secret appears.

**1. Bearer tokens do not work today — trace.**

- `requireHousehold` → `verifySession` (`src/lib/auth/dal.ts:24-30`) → `supabase.auth.getClaims()` with **no token argument**, so it reads the session from wherever the client stores it.
- The client comes from `createClient()` (`src/lib/supabase/server.ts:5-32`), which is `createServerClient` wired **only** to `cookies()`. There is no `global.headers.Authorization` pass-through and no `accessToken` option.
- Therefore an Expo request carrying `Authorization: Bearer <access_token>` and no cookie yields `getClaims() → null` → `unauthorized()` (`src/lib/api/http.ts:66`). **Every endpoint 401s.** The failure is silent and total, not partial.
- Even if auth were patched, the *data* path fails the same way: the Supabase client sends only the publishable key, so PostgREST sees `auth.uid() = null` and RLS returns zero rows / denies writes. Both the identity check and the tenancy check need the token.
- `src/proxy.ts:31` (matcher at `:36-39` covers `/api/*`) does a network `getUser()` on every API request to refresh the *cookie* session — pure dead latency for a bearer client, and it cannot refresh a mobile token.

**What would have to change to keep it:** `createClient()` gains a bearer-aware variant (`createServerClient(url, key, { accessToken: () => token, cookies: noop })` or `global.headers.Authorization`), `verifySession` gains an explicit-token path (`getClaims(token)`), `requireHousehold` threads the request headers through (it currently takes no arguments at all — `src/lib/api/http.ts:61`), and `proxy.ts` excludes `/api/*` from the matcher. That is a real refactor of the DAL's signature, and it touches the web app's hot path.

**2. Where the non-DB logic lives in each option.**

This is the decisive point, and it favours deletion more than one would expect:

- `getSummary` (`src/lib/queries/summary.ts:29-109`) is *already* client-agnostic. It takes a Supabase client as its first parameter and uses only the generic query builder; nothing in it is server-only. Hand it a native `supabase-js` client and it runs unchanged in Expo.
- `kapa-math` is pure arithmetic. `mappers.ts` is pure shape translation. `attribution.ts`, `category-breakdown.ts`, `daily-totals.ts` are pure. `validation.ts` is isomorphic zod — its own header (`src/lib/validation.ts:2-4`) already anticipates "the web form, the API, and a future mobile client".
- Attribution is a DB column (`expenses.user_id`) plus a display-name join, enforced by RLS's `same_household(id)` policy — no server needed.
- The one thing that *looks* server-only, the cross-household join merge, is a `SECURITY DEFINER` RPC (`join_household`) — `src/lib/mutations/household.ts:45` just calls `.rpc()`, which a native client can do identically.
- Currency stamping on insert (`src/lib/mutations/expenses.ts:22-38`) is the only genuine "server trusts itself" logic, and it is not actually protected today: the REST layer refuses `currency` from the body (`validation.ts:5-7`) but RLS doesn't stop a direct PostgREST insert from setting it. If you care, that belongs in a DB trigger or a `BEFORE INSERT` default — which is where it should have been anyway, and which then protects *both* clients.

So under "delete", nothing is homeless. Under "keep", you take on: a bearer auth refactor, an error-envelope redesign, pagination, versioning, an OpenAPI pipeline and a generated client — several days of work whose only payoff is an indirection layer that re-implements what PostgREST already gives you, on a Vercel function that adds a round trip and a cold start to every read.

**3. What you lose by deleting, honestly.**

- A place to hold server-only secrets (FX rates, a push-notification provider key). Neither exists yet; when one does, add a single purpose-built endpoint then. Deleting now does not burn that bridge.
- Schema-shape coupling: the mobile client becomes coupled to table/column names rather than to a curated payload. Mitigated by routing *all* mobile access through the shared `lib/queries/*` + `mappers.ts` package, which is the same seam the web app uses. A column rename is then a one-package change, not a wire break — arguably *stronger* coupling control than an unversioned REST surface with no OpenAPI.
- Rate limiting / abuse control at the edge. Supabase has its own; for a two-person household app this is not a real concern.
- Force-upgrade leverage over old app versions (§7). Real, but an unversioned REST surface gives you none of that today either.

**4. Concrete plan.**

1. Move `HouseholdPanel`'s two `fetch` calls (`src/components/household/HouseholdPanel.tsx:32,60`) to Server Actions, matching the other eight. That removes the last web consumer of `/api/*`.
2. Delete `src/app/api/{summary,expenses,cap,categories,household}/**` and their tests. Keep `src/app/api/keepalive/route.ts` (cron, bearer-authenticated by `CRON_SECRET` — note this one *does* read `Authorization` correctly, `src/app/api/keepalive/route.ts:12`).
3. Extract `lib/{kapa-math,mappers,types,validation,queries,mutations,attribution,category-breakdown,daily-totals,format,date}` into a workspace package. Type its Supabase client as `SupabaseClient<Database>` rather than `SupabaseServerClient` (`src/lib/supabase/types.ts`) so both runtimes satisfy it.
4. Move currency stamping into a DB trigger; add a DB-level check that `expenses.household_id` matches the caller's membership on insert (RLS `WITH CHECK`).
5. Update PLAN.md §4/§5 to record the decision — §4's "reused by mobile" framing is what keeps this layer alive.

**If you overrule this and keep it:** fix §1's auth first (nothing else matters until a mobile client can get a 200), then §3 error codes, §4 pagination, §5 timezone exposure, in that order. Sections 2-10 below are written to be useful either way — every one of them is also a checklist of what the shared package must get right.

---

### Coverage parity

`H` = how the web UI actually does it.

| Operation | Server Action | REST endpoint | Used by web UI |
|---|---|---|---|
| List expenses | — | `GET /api/expenses` (`expenses/route.ts:7`) | `lib/queries` in a Server Component |
| Read one expense | — | **missing** (`getExpense` exists, `queries/expenses.ts:48`) | `lib/queries` (edit screen) |
| Create expense | `addExpense` (`actions/expenses.ts:20`) | `POST /api/expenses:33` | Action |
| Update expense | `updateExpense:46` | `PATCH /api/expenses/[id]:5` | Action |
| Delete expense | `deleteExpense:78` | `DELETE /api/expenses/[id]:42` | Action |
| Summary | — | `GET /api/summary:6` | `getSummary` in a Server Component |
| Read cap | — | `GET /api/cap:6` (broken, see below) | `lib/queries` |
| Set cap | `setCap` (`actions/cap.ts:15`) | `PUT /api/cap:20` | Action |
| List categories | — | `GET /api/categories:6` | `lib/queries` |
| Create category | `addCategory` (`actions/categories.ts:20`) | `POST /api/categories:19` | Action |
| Update/archive category | `editCategory:47` | `PATCH /api/categories/[id]:5` | Action |
| **Reorder category** | `moveCategory:80` | **missing** | Action |
| **Set display name** | `setDisplayName` (`actions/profile.ts:19`) | **missing** | Action |
| **Set locale** | `setLocale:47` | **missing** | Action |
| Household read | — | `GET /api/household:8` | Server Component |
| Mint invite | — | `POST /api/household/invite:5` | **`fetch`** (`HouseholdPanel.tsx:32`) |
| Join household | — | `POST /api/household/join:18` | **`fetch`** (`HouseholdPanel.tsx:60`) |
| **Household currency/timezone** | — | **missing** (only `currency` leaks via summary) | Server Component |

**Gaps toward REST (4 mobile blockers):** category reorder, display name, locale, and household settings (currency + timezone). A mobile client cannot complete onboarding — it cannot set the user's name for attribution, cannot pick a language, and cannot learn which timezone the server uses to slice months.

**Gaps toward Server Actions (1):** invite/join have no action, so the web app is forced into `fetch` for exactly two operations — the inconsistency that keeps `/api/*` load-bearing for the web build.

**Verdict:** a partial mirror, and PLAN.md §4 documents the drift as intentional ("dual path (as shipped, not as originally imagined)"). Every operation that exists in both places is a place where the two can diverge silently — and one already has: `PATCH /api/expenses/[id]:18-39` hand-rolls the update that `mutations/expenses.ts:56` owns, so a fix to `updateExpense` (say, a `WITH CHECK` or an `updated_at` bump) reaches the Server Action and not the REST route.

---

### Auth cannot serve a non-browser client

**Severity: critical (blocking)**

Traced in the strategic section above. Evidence: `src/lib/auth/dal.ts:26` (`getClaims()` with no token), `src/lib/supabase/server.ts:10-31` (cookies-only client), `src/lib/api/http.ts:61` (`requireHousehold()` takes no request and so cannot read a header), `src/proxy.ts:31,36-39` (cookie refresh applied to `/api/*`). Contrast `src/app/api/keepalive/route.ts:12`, the only handler in the repo that reads `Authorization` — proving the shape is understood, just not applied to the user-facing surface.

**Fix (if keeping):** `requireHousehold(request)`; extract the bearer token; `createClient({ accessToken })`; `verifySession(token)`; exclude `/api` from the proxy matcher; add a test that a bearer-only request (no cookie) reaches a 200 — which no current test could catch, since all of them mock `verifySession` (`expenses/route.test.ts:5-8`).

### Error envelope is prose, not a contract

**Severity: high**

Three different shapes come back for failures:

- `{ error: 'Not found' }` / `{ error: 'Unauthorized' }` (`src/lib/api/http.ts:21,32`)
- `{ error: 'Invalid request', details: <zod flatten> }` (`http.ts:24-29`) — `details` is `ZodError.flatten()` output, i.e. a *library-internal* structure (`{ formErrors, fieldErrors }`) promoted to a wire format. A zod major upgrade changes the contract; `flatten()` is already deprecated in zod 4.
- `{ error: 'Invalid request', details: 'Invalid or expired invite code' }` (`household/join/route.ts:31`) — same status, same field, but `details` is a bare string here. A client that does `details.fieldErrors` crashes on this path.

Plus eight distinct English 500 strings (`'Failed to load expenses'`, `'Failed to save the monthly cap'`, …) with no code to branch on, and 401 conflating "not signed in" (re-auth) with "no household" (`http.ts:66,70`) — two states requiring completely different client behaviour, indistinguishable on the wire.

English-only is defensible for a server *log*; it does not survive a localized client. A Russian-locale mobile app has three options today: render English at the user, string-match English prose, or show a generic message and lose all specificity. The Server Actions already prove the point — they translate via `next-intl` (`actions/expenses.ts:22-26`), so the same failure is localized in the web app and English over REST.

**Fix:** stable machine codes, message as debug-only.

```json
{ "error": { "code": "expense_not_found", "message": "Not found", "details": [{"path":"amountMinor","code":"too_small"}] } }
```

Codes needed at minimum: `unauthenticated`, `no_household`, `invalid_body`, `invalid_invite_code`, `not_found`, `internal`. Emit `details` as a normalized `{path, code}[]` derived from `ZodError.issues` — never `flatten()` — so it survives zod upgrades and can drive per-field messages in the client's own language.

### Collections: unbounded, unpaginated, silently truncating

**Severity: high**

`GET /api/expenses` (`src/app/api/expenses/route.ts:7-31` → `queries/expenses.ts:17-42`) has no `limit`, no `offset`, no cursor, and no `Range` handling. Consequences:

- **Silent truncation.** With `month` omitted the query is the household's entire history. Supabase enforces a PostgREST `max-rows` (1000 by default on hosted projects); the client receives a truncated array with **no indicator** — no `Content-Range` is forwarded, no `hasMore` flag. A client paging by month never notices; a client doing a full sync silently loses the oldest data.
- `category` is taken raw from the query string and passed to `.eq()` (`route.ts:12,24`) with **no uuid validation**, unlike every body field. A malformed value produces a Postgres `invalid input syntax for type uuid` → thrown → **500 where it should be 400**. Note `monthParamSchema` right above it does validate — the asymmetry is the bug.
- No way to express "uncategorized" (`category_id IS NULL`), which is a first-class state everywhere else (`categoryId: string | null` in `types.ts:60`, and `categoryBreakdown` keys on `null`, `types.ts:93`).
- Sort is fixed `spent_at DESC` with **no tiebreaker** (`queries/expenses.ts:27`). Two expenses at the same instant order non-deterministically, so keyset pagination on `spent_at` alone would be unsound the day you add it.
- Empty is `[]`, correctly (not 204, not `null`) — good, and worth preserving.

**Fix:** `limit` (default 50, max 200) + keyset cursor on `(spent_at, id)`; add `id` as the secondary sort key now, before any client depends on the current order; validate `category` with `z.uuid()` and accept the literal `none` for null; return `{ items, nextCursor }` rather than a bare array so the envelope has room to grow.

### Payload shape: timezone is missing, and the date format is asymmetric

**Severity: high**

**Timezone (critical).** Every month boundary on the server is computed from `households.timezone` (`queries/summary.ts:46-48`, `queries/expenses.ts:30-31`, via `monthWindow`). That value is mapped into the domain (`mappers.ts:47`) and then **exposed on no endpoint**. `GET /api/household` returns members and the invite code (`household/route.ts:17-22`) but not currency or timezone; `GET /api/summary` leaks only `currency`. A client in Berlin therefore cannot: decide which month "today" belongs to, group history into days consistently with the server, or render the same day boundary the cap math uses. It will guess with the device timezone and be quietly wrong near midnight and on the 1st of the month.

**Date format asymmetry.** `spentAt` is passed through raw from `timestamptz` (`mappers.ts:76`), which PostgREST serialises as `2026-08-01T12:00:00+00:00`. But the input schema is `z.string().datetime()` (`validation.ts:20`), which by default **rejects a numeric offset** and requires `Z`. So the API emits a timestamp it would refuse to accept back — a client that reads an expense, edits the note, and PATCHes the object back gets a 400. Fix: normalize on output (`new Date(row.spent_at).toISOString()`) and accept offsets on input (`z.string().datetime({ offset: true })`).

**Money.** Minor units are documented clearly in `types.ts:7-9` — but that's a source comment, not a wire contract. Nothing in any response says the unit or the exponent; `CURRENCY_EXPONENT` (`types.ts:19-23`) never crosses the wire. RSD (exponent 0) alongside EUR/USD (exponent 2) makes a wrong guess a 100x display error. The `Money` brand is also erased over JSON — expected, but it means the client re-derives its own safety. Fix: name the field's unit in the OpenAPI/shared package, and serve `{ currency, exponent, timezone }` from a `GET /api/me` (or the household endpoint).

**camelCase.** Consistent and clean — `mappers.ts:35-79` translates every row at the data edge and no snake_case escapes. The one exception is the layering bypass at `expenses/[id]/route.ts:18-22`, which builds a snake_case `Partial<ExpenseRow>` inline; it still maps back through `toExpense` on the way out, so the wire stays clean, but the pattern is one careless line from leaking.

**Null vs absent.** PATCH semantics are correct and deliberate (undefined = leave, explicit null = clear — `mutations/expenses.ts:50-54`), but *asymmetric across resources*: `expenseUpdateSchema` is a bare `.partial()` (`validation.ts:23`), so `PATCH {}` is an accepted no-op returning 200, while `categoryUpdateSchema` refuses an empty object (`validation.ts:43`). Pick one.

**Enums.** `color` is a strict server-side allowlist on input (`validation.ts:33`) but degrades to `color: string` on output (`types.ts:48`), so a generated client gets `string` and loses exhaustiveness. Same for `Currency` — validated nowhere on the way out, just cast (`mappers.ts:46,74`).

**`GET /api/cap` 500s for a household with no cap** — `json(null, { status: 204 })` (`cap/route.ts:12`) violates the Fetch spec's no-body-on-204 rule, throws, and lands in the route's own catch. Documented as a known bug in `cap/route.test.ts:45-57`. This is the *first* call a fresh mobile install makes. Return `200 {"monthlyCap":0,...}` or a proper bodiless `new Response(null,{status:204})` — the former is friendlier, since a 204 forces every client to special-case a state that has an obvious neutral value.

### HTTP semantics

**Severity: medium**

- `POST /api/expenses` returns 201 (`expenses/route.ts:47`) but **no `Location` header**; same for categories (`categories/route.ts:32`) and invite (`household/invite/route.ts:11`).
- `POST /api/household/join` returns **200, not 201** (`join/route.ts:28`) — arguably right, since it mutates membership rather than creating an addressable resource. Fine, but document it.
- `DELETE /api/expenses/[id]` returns `200 {id}` (`expenses/[id]/route.ts:63`) rather than 204. Reasonable — but a repeat delete then 404s (`:62`), which is spec-legal yet awkward for an offline retry queue. Prefer 204 on both attempts, or keep 404 and have the client treat it as success.
- 404-not-403 for another household's row (`expenses/[id]/route.ts:38`, `categories/[id]/route.ts:23`) is the **right** call — it leaks no existence information, and since the row is genuinely invisible under RLS, 404 is also the honest answer.
- **No idempotency key on `POST /api/expenses`.** PLAN.md Phase 4 ships offline retry ("expenses submitted offline retry automatically"); a retried POST after an ambiguous timeout double-books the expense against a shared cap that two people watch. Accept an `Idempotency-Key` header, store it with a unique index, return the original 201 on replay. This is the one HTTP-semantics item that causes real user-visible damage.
- 405 + `Allow` come free from Next's router; no `OPTIONS`/CORS headers exist anywhere. Native Expo doesn't need CORS, but Expo Web / a browser dev client does — worth knowing before someone loses an afternoon to it.

### Versioning

**Severity: medium**

No `/v1` prefix; no `Accept` versioning; no minimum-client signal. For a web-only app that is correct — the client ships with the server. The moment an App Store binary exists you have callers you cannot force-update, and PLAN.md §5's plan to share zod schemas "via a small internal package or copied module" makes drift likely (a *copied* module drifts by construction).

Proportionate recommendation for a personal project: **rename the directory to `src/app/api/v1/` now** while there are two `fetch` call sites to update, and adopt an additive-only rule (never remove or retype a field; new fields optional). Skip content negotiation and deprecation headers. If you take the delete recommendation instead, version the shared package with semver and pin the mobile app to a major — same discipline, zero HTTP machinery.

### Caching & concurrency

**Severity: medium (concurrency), low (caching)**

**Caching.** No handler sets `Cache-Control` or `ETag`. Next route handlers are uncached by default, which is correct-but-unoptimized: `/api/summary` is the hot read (whole home screen, refetched on every foreground) and `/api/categories` is near-static. Cheap win: `Cache-Control: private, max-age=0, must-revalidate` plus a weak `ETag` over the JSON body, so a foregrounded app that has not changed anything gets a 304 instead of a payload. Do not use shared/public caching — every response is household-scoped.

**Concurrency — the real problem.** `expenses` has `created_at` but **no `updated_at`** (PLAN.md §3 schema), nothing is returned that could serve as a version, and `PATCH` unconditionally overwrites (`expenses/[id]/route.ts:26-32`). Two household members editing the same expense today: **last write wins, silently, with no detection and no recovery.** Neither client learns that a write was clobbered. Given the whole product premise is *two people sharing one pool*, this is the concurrency case most likely to actually happen.

**Fix:** add `expenses.updated_at` (trigger-maintained), return it in `toExpense` (`mappers.ts:69-78`), emit it as the `ETag`, and honour `If-Match` on PATCH/DELETE — `.eq('updated_at', ifMatch)` and a 412 when zero rows match. The DB work is a migration; the handler work is four lines.

### Contract enforcement

**Severity: medium**

No OpenAPI, no generated client, no response-shape schema. `validation.ts` is already the single source of truth for **requests** and explicitly says so (`validation.ts:2-4`) — but responses are hand-written TS interfaces (`types.ts:25-95`) with no runtime representation, so nothing verifies that `toExpense` actually produces an `Expense`, and nothing can generate a client type from them.

Lightest path that actually closes the loop:

1. Define **response** schemas in zod next to the request ones (`expenseSchema`, `summarySchema`, `categorySchema`, …) and replace the interfaces in `types.ts` with `z.infer` of those. One source, zero duplication, and `Money`/`Currency` brands survive via `.brand()`.
2. Add a ~30-line script using `zod-to-json-schema` (or `@asteasolutions/zod-to-openapi`) emitting `openapi.json` in CI; fail the build if it differs from the committed copy. That single diff is your breaking-change detector.
3. Skip codegen entirely — the mobile app imports the same zod schemas from the shared package and gets types for free. Codegen is only worth it for a client you don't control.

If you take the delete recommendation, step 1 is still worth doing (it hardens the shared package) and steps 2-3 vanish.

### Testing

**Severity: medium**

The route tests are better than typical: every route asserts 401 signed-out, 401 no-household, 400 invalid body, and several assert 500-on-DB-error and 404-wrong-household (`expenses/[id]/route.test.ts:59`, `categories/[id]/route.test.ts:56`). Status-code coverage is genuinely good, and `cap/route.test.ts:45-51` even documents the 204 bug in a comment rather than hiding it.

The gap is **response shape**. Happy-path assertions are one field deep — `expect(await res.json()).toHaveLength(1)` (`expenses/route.test.ts:77`), `expect((await res.json()).cap).toBe(100_000)` (`summary/route.test.ts:81`), `expect((await res.json()).amountMinor).toBe(500)` (`expenses/route.test.ts:110`). Renaming `spentAt`→`spent_at`, dropping `addedBy`, or adding a stray field in `mappers.ts` breaks **no test**. Only `cap/route.test.ts:74-78` does a full `toEqual` — that is the pattern the others should copy.

Second gap: **auth is mocked away**. Every file stubs `verifySession` and `getHouseholdId` (`expenses/route.test.ts:5-8`), so the tests are structurally incapable of catching the bearer-token failure in §1 — the single most important contract property.

Third: no test asserts an **error body shape**, only its status, so the three-way divergence in the error envelope is invisible to CI.

**Fix:** full `toEqual` on every happy-path body (or `expect(responseSchema.safeParse(body).success).toBe(true)` once §9 lands); one integration test that exercises the real auth path with a token instead of a mock.

---

## What's done well

- **`requireHousehold` is a genuinely good abstraction** (`src/lib/api/http.ts:61-82`) — one place decides what "not signed in" and "no household" mean, it logs the raw Postgres error and returns a generic message, and PLAN.md §4 records the inconsistency it replaced. The eight Server Actions repeating that preamble by hand are the ones that should adopt *it*, not the reverse.
- **The query/mutation layer is already client-agnostic and well-factored.** `getSummary`, `listExpenses`, `createExpense` all take a Supabase client and return domain types; `EXPENSE_COLUMNS` (`mutations/expenses.ts:11-12`) keeps the projection in one place. This is exactly the seam that makes deleting the REST layer cheap.
- **zod at every input boundary**, with the security-relevant omission documented at the top of the file: `currency` is deliberately not accepted from the client and is stamped server-side (`validation.ts:5-7`, `mutations/expenses.ts:22-38`).
- **`.single()` / `.maybeSingle()` discipline is consistently right**, and `null` → 404 is distinguished from `error` → 500 at every call site — the mistake most codebases make and this one doesn't.
- **404-not-403 for another household's row** is the correct information-disclosure tradeoff, and it falls out of the RLS model rather than being bolted on.
- **`POST /api/household/join` distinguishes expected RPC errors from genuine failures** via an explicit allowlist with a comment explaining why (`join/route.ts:7-15,31`) — the alternative (blanket-400 on any error) is the usual shortcut, and it was avoided.
- **`mappers.ts` holds the snake_case boundary firmly**, keyed off generated Supabase row types rather than hand-written shapes.
- **PLAN.md §4 documents the dual path honestly** ("as shipped, not as originally imagined"), including that the web app does not consume its own API. That candour is what makes this review's central question answerable at all.
