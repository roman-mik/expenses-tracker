## Supabase Integration

**Overall assessment.** The integration is in good shape and mostly follows the current `@supabase/ssr` guidance: `getAll`/`setAll` cookie adapters everywhere (no deprecated `get`/`set`/`remove`), a per-request server client created inside `createClient()` with `await cookies()`, session refresh in `src/proxy.ts` that writes refreshed cookies to *both* the downstream request and the response, and authorization done in a DAL (`verifySession` → `getClaims()`, which is signature-verified — not `getSession()`), never from middleware. No `service_role` key exists anywhere in the repo; only the publishable key is used, correctly under `NEXT_PUBLIC_`. Generated types are current (they include the 0004 `profiles.locale` column and all 0003 household tables), and every query selects explicit columns rather than `select('*')`.

The gaps are mostly at the margins: the `setAll` adapter in the proxy drops the new `headers` argument that `@supabase/ssr` 0.12.4 passes for cache-safety (a real CDN risk on Vercel), every `PostgrestError` is flattened to `new Error(error.message)` so no error code is ever inspected, two multi-statement mutations (invite minting, category reorder) are non-atomic where an RPC is warranted, `/api/expenses` without a `month` is an unbounded select that PostgREST silently truncates at `max_rows`, the auth callback has no `token_hash`/`verifyOtp` branch (so Supabase invite/recovery links will fail), and the `fake-supabase` test double models error shapes loosely enough that several production failure modes are untestable.

---

### `setAll` in the proxy ignores the cache-control `headers` argument

**Severity: High**

`@supabase/ssr` 0.12.4 changed `SetAllCookies` to a two-argument callback: the second argument carries headers that *must* be applied to the response whenever auth cookies are written.

`node_modules/@supabase/ssr/dist/main/types.d.ts` (SetAllCookies):

```ts
export type SetAllCookies = (cookies: {...}[],
/**
 * Headers that must be set on the HTTP response alongside the cookies.
 * Responses that set auth cookies must not be cached by CDNs or
 * reverse proxies, otherwise one user's session token can be served
 * to a different user.
 * - `Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`
 * - `Expires: 0`
 * - `Pragma: no-cache`
 */
headers: Record<string, string>) => Promise<void> | void;
```

`src/proxy.ts:18-26` and `src/lib/supabase/server.ts:20-29` both declare `setAll(cookiesToSet)` only — the headers are dropped. On Vercel (a CDN/edge in front of the app) a proxy response that carries a refreshed `Set-Cookie` can in principle be cached and replayed to another user. The library's own doc comment calls this out explicitly, so it is not hypothetical.

Fix (`src/proxy.ts`):

```ts
setAll(cookiesToSet, headers) {
  cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
  response = NextResponse.next({ request });
  cookiesToSet.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options)
  );
  Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
},
```

In `server.ts` the same headers should be applied where a response object is available (route handlers); at minimum add a comment noting that the proxy is the only place cookies are actually committed. Note the return-type is `void`, so TypeScript will *not* flag the missing parameter — this can only be caught by reading the installed types.

---

### Auth callback cannot handle Supabase's `token_hash` links

**Severity: High**

`src/app/auth/callback/route.ts:20-28` only understands `?code=` (the PKCE authorization-code flow). But nothing in the app ever *starts* a PKCE flow: `LoginForm.tsx:26` uses `signInWithPassword` exclusively, and there is no `signInWithOtp` / `signInWithOAuth` call anywhere in `src/`. The only way a user reaches `/auth/callback` today is via an email Supabase generated (invite, confirmation, magic link, recovery) — and those links carry `?token_hash=...&type=invite|magiclink|recovery`, not `?code=`, because the flow did not originate in this browser and no `code_verifier` cookie exists to complete PKCE.

Concretely: the "manually create the user in the dashboard and send an invite" onboarding described in `README.md:28` and `supabase/migrations/0002_optional_allowlist.sql:3-5` will land on `/login?error=missing_code` (`route.ts:21`).

Fix — handle both shapes:

```ts
const code = searchParams.get('code');
const tokenHash = searchParams.get('token_hash');
const type = searchParams.get('type') as EmailOtpType | null;

const supabase = await createClient();
const result = code
  ? await supabase.auth.exchangeCodeForSession(code)
  : tokenHash && type
    ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    : null;

if (!result) return NextResponse.redirect(`${origin}/login?error=missing_code`);
if (result.error) return NextResponse.redirect(`${origin}/login?error=closed`);
```

Also note `result.data.user` can be `null` on `verifyOtp`; guard before `data.user.id` (`route.ts:34`).

---

### Every PostgrestError is flattened to `new Error(message)` — no code is ever inspected

**Severity: Medium**

The pattern `if (error) throw new Error(error.message)` appears in all 13 data-access functions — e.g. `src/lib/queries/cap.ts:19`, `src/lib/queries/expenses.ts:40,60`, `src/lib/queries/household.ts:28,49,57,80`, `src/lib/mutations/categories.ts:30,45,72,116-117`, `src/lib/mutations/expenses.ts:27,45,78,99`, `src/lib/mutations/household.ts:28,36,52`, `src/lib/mutations/profile.ts:24,40`. The `code`, `details`, and `hint` fields of `PostgrestError` are discarded at the throw site, and the route handlers then catch and replace the message with a generic 500 (`src/app/api/categories/route.ts:33-36`, etc.).

Consequences that are reachable today:

- A duplicate invite `code` (PK on `household_invites.code`, `supabase/migrations/0003_households.sql:42`; only 4 random bytes, `src/lib/mutations/household.ts:11`) raises `23505` and surfaces as `500 "Failed to create an invite code"` instead of a transparent retry.
- `.single()` on a row that RLS hid returns `PGRST116`, which becomes an indistinguishable 500 rather than a 404/403.
- An RLS *denial* on a read is not an error at all — PostgREST returns an empty result set, so `getCap`/`getHousehold`/`getExpense` return `null` and the UI renders "no data" instead of "forbidden". `getHousehold` (`src/lib/queries/household.ts:29-31`) goes further and *fabricates* a default `{ currency: 'RSD', timezone: 'Europe/Belgrade' }` household for an id it could not read — meaning a client-side household-scoping bug or an RLS regression shows up as plausible-looking wrong data rather than a failure. Same for `createExpense`'s `household?.currency ?? 'RSD'` fallback (`src/lib/mutations/expenses.ts:29`).

Fix — preserve the code with a small typed error, and stop inventing fallbacks:

```ts
// src/lib/errors.ts
export class DbError extends Error {
  constructor(readonly code: string, readonly detail: string | null, message: string) {
    super(message);
  }
  static from(e: PostgrestError) { return new DbError(e.code, e.details, e.message); }
}

// usage
if (error) throw DbError.from(error);

// route handler
catch (error) {
  if (error instanceof DbError && error.code === '23505') return json({ error: 'Already exists' }, { status: 409 });
  ...
}
```

And in `getHousehold`, throw rather than defaulting — a missing household for an id the DAL just resolved is a bug, not a normal state.

---

### `createInvite` is a non-atomic delete-then-insert

**Severity: Medium**

`src/lib/mutations/household.ts:24-37` deletes all existing codes for the household, then inserts a new one as a separate round trip. If the insert fails (unique-code collision, network blip, RLS `invites_insert` check on `created_by = auth.uid()`), the household is left with **no** invite code and the previously working one is gone. There is no transaction boundary and no rollback.

This is the mirror of the join path, which the codebase already gets right — `joinHousehold` (`household.ts:49-51`) calls the `join_household` SECURITY DEFINER RPC precisely so the multi-table merge is transactional. Invite minting deserves the same treatment:

```sql
create or replace function public.mint_invite(p_household_id uuid)
returns text language plpgsql security invoker set search_path = public as $$
declare new_code text;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'Not a member';
  end if;
  delete from public.household_invites where household_id = p_household_id;
  new_code := upper(encode(gen_random_bytes(4), 'hex'));
  insert into public.household_invites (code, household_id, created_by)
    values (new_code, p_household_id, auth.uid());
  return new_code;
end $$;
```

```ts
export async function createInvite(supabase: SupabaseServerClient, householdId: string) {
  const { data, error } = await supabase.rpc('mint_invite', { p_household_id: householdId });
  if (error) throw DbError.from(error);
  return data as string;
}
```

Note this also moves code generation server-side, dropping the `node:crypto` import (`household.ts:6`) that currently pins these helpers to the Node runtime.

---

### `moveCategory` swaps sort orders with two independent, un-ordered updates

**Severity: Medium**

`src/lib/mutations/categories.ts:104-115` issues both halves of the swap in a `Promise.all`. There is no transaction, so a failure of the second update leaves two categories sharing a `sort_order` (there is no unique constraint on `(household_id, sort_order)` — see `supabase/migrations/0003_households.sql:125`, a plain index — so the corruption is silent, and `getCategories`'s `.order('sort_order')` then returns a nondeterministic order). Two members reordering concurrently can also interleave into a duplicate.

Fix with a small RPC that does both updates in one statement:

```sql
create or replace function public.swap_category_order(a uuid, b uuid)
returns void language sql security invoker as $$
  update public.categories c set sort_order = o.sort_order
  from (select id, sort_order from public.categories where id in (a, b)) o
  where c.id in (a, b) and o.id <> c.id;
$$;
```

The read that precedes it (`categories.ts:87-91`) also fetches every category to find one index; that part is fine at this scale, but the RPC should re-derive the sibling server-side to close the read-then-write race.

---

### `/api/expenses` without `month` is an unbounded select, silently truncated

**Severity: Medium**

`src/lib/queries/expenses.ts:23-39` applies `.gte`/`.lt` only when `month` is supplied, and never calls `.limit()` or `.range()`. `GET /api/expenses` makes `month` optional (`src/app/api/expenses/route.ts:14-19`), so a caller omitting it selects the household's entire history. PostgREST caps this at `max_rows = 1000` (`supabase/config.toml`, `[api] max_rows = 1000`) and returns the truncated set **with no error and no indication of truncation** — the client sees a complete-looking list that is missing rows. At ~5 expenses/day a household hits that ceiling in well under a year.

Fix — make the bound explicit and expose it:

```ts
export interface ListExpensesOptions {
  month?: string;
  categoryId?: string;
  limit?: number;   // default 200
  offset?: number;
}
// ...
const limit = options.limit ?? 200;
const offset = options.offset ?? 0;
let query = supabase
  .from('expenses')
  .select('id, category_id, amount_minor, currency, note, spent_at, user_id', { count: 'exact' })
  .eq('household_id', householdId)
  .order('spent_at', { ascending: false })
  .range(offset, offset + limit - 1);
```

Returning `count` lets the route report `hasMore` instead of guessing. The same applies to `getSummary`'s expense scan (`src/lib/queries/summary.ts:51-56`): it is month-bounded, so safe today, but it fetches every row to sum them in JS — an aggregate RPC (`sum(amount_minor) group by currency, category_id`) would be a single small response and would also be immune to `max_rows`.

---

### Row casts defeat the generated types

**Severity: Medium**

Every query narrows its `select()` to specific columns and then casts the result to the full generated Row type: `data as BudgetSettingsRow` (`src/lib/queries/cap.ts:21`), `data as CategoryRow[]` (`src/lib/queries/categories.ts:20`), `data as ExpenseRow` (`src/lib/queries/expenses.ts:41,61`), `data as HouseholdRow` (`src/lib/queries/household.ts:32`), `data as ProfileRow` (`src/lib/queries/profile.ts:22`), and throughout the mutations.

The cast is a lie in every case — `getCap` selects three columns but claims a `BudgetSettingsRow`, which also declares `household_id` and `updated_at`. More importantly it *disables* the one guarantee `database.types.ts` buys you: with a typed client, `supabase.from('categories').select('id, name, color, sort_order, archived')` already returns a precisely-typed object, and renaming a column in a migration would break the build at the select site. With the cast, the build stays green and the failure moves to runtime.

Fix — delete the casts and let the mappers take the inferred type:

```ts
// mappers.ts
export function toCategory(row: Pick<CategoryRow, 'id'|'name'|'color'|'sort_order'|'archived'>): Category { ... }

// categories.ts
const { data, error } = await supabase.from('categories').select('id, name, color, sort_order, archived')...
if (error) throw DbError.from(error);
return data.map(toCategory);   // no cast
```

Related nit: `mappers.ts:44,52,68` cast `row.currency as Currency` and `row.locale as Locale` because those columns are `text` with a CHECK rather than a Postgres enum. Promoting them to real enums would make `gen:types` emit union types and remove the casts entirely.

---

### `gen:types` is not verified in CI — drift is possible, just not present

**Severity: Medium**

`package.json` defines `"gen:types": "supabase gen types typescript --local > src/lib/supabase/database.types.ts"`, but `.github/workflows/ci.yml` never runs it. The job already does `supabase start` → `npm run test:db` → `supabase stop`, so the local stack is up and the check is nearly free.

I compared the committed file against the migrations' final state and it is **current**: `profiles.locale` from 0004 is present (`database.types.ts:257`), the 0003 household tables and the `budget_settings` `user_id` → `household_id` pivot are reflected, and all four functions (`current_household_id`, `is_household_member`, `join_household`, `same_household`) are typed. So this is a process gap, not present drift.

Fix — add between `test:db` and `supabase stop`:

```yaml
      - run: npm run gen:types
      - run: npx prettier --write src/lib/supabase/database.types.ts
      - run: git diff --exit-code src/lib/supabase/database.types.ts
```

The prettier step is needed because the committed file is prettier-formatted (single quotes, 2-space) while the CLI emits its own style, and `npm run format:check` runs over it.

Minor: the committed file's `DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>` (`database.types.ts:~290`) references a key `Database` does not declare — recent CLI versions emit an `__InternalSupabase: { PostgrestVersion: ... }` block. Harmless, but a sign the file was generated by a different CLI version than the one CI would install with `version: latest`, which the diff check above would immediately surface.

---

### `fake-supabase.ts` diverges from the real client's error and result shapes

**Severity: Medium**

`src/test/fake-supabase.ts` is a genuinely useful double, but several deviations mean tests can pass while production breaks:

1. **Errors carry no `code`** (`fake-supabase.ts:17`: `type PGError = { message: string } | null`). The real `PostgrestError` has `code`, `details`, `hint`. If the codebase adopts the `23505`/`PGRST116` handling recommended above, every such branch is untestable and will silently take the `else` path in tests.
2. **`.single()` on zero rows** returns `{ message: 'Row not found' }` (`fake-supabase.ts:181`); the real client returns code `PGRST116` with the message *"JSON object requested, multiple (or no) rows returned"*. Any code matching on message text would pass here and fail live.
3. **`.maybeSingle()` never errors on multiple rows** (`fake-supabase.ts:184`: `rows[0] ?? null`). The real client returns a `PGRST116` error when >1 row matches. This matters directly for `getHouseholdId` (`src/lib/auth/dal.ts:45-49`), whose safety rests on the `unique (user_id)` constraint in `supabase/migrations/0003_households.sql:36` — if that constraint were ever relaxed ("drop to relax later", per its own comment), production would start throwing while the tests keep passing.
4. **`select(_cols)` is ignored entirely** (`fake-supabase.ts:98-100`), so seeded rows return every field regardless of the projection. A test can therefore assert on a column the query never selected.
5. **No constraint enforcement** — inserts don't check NOT NULL, uniqueness, FKs, or apply column defaults (`fake-supabase.ts:195-208`); `upsert` matches on *any* shared key rather than `onConflict` (`fake-supabase.ts:215-219`), which will match the wrong row as soon as a second upsert exists in the codebase.
6. **RLS is not modeled at all**, which is inherent to the design. That's acceptable *because* `supabase/tests/database/` covers policies via pgTAP — worth a comment in the file pointing there, so nobody mistakes a green unit suite for authorization coverage.

Minimum fix — make errors structurally faithful:

```ts
type PGError = { message: string; code: string; details: string | null; hint: string | null } | null;

failNext(table: string, message: string, code = 'XX000') { ... }

// single()
return rows.length === 1
  ? { data: rows[0], error: null }
  : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: null, hint: null } };

// maybeSingle()
if (rows.length > 1) return { data: null, error: { code: 'PGRST116', ... } };
return { data: rows[0] ?? null, error: null };
```

---

### The proxy makes a network `getUser()` call on every matched request

**Severity: Medium**

`src/proxy.ts:31` calls `supabase.auth.getUser()`, which always round-trips to the Supabase Auth server. The matcher (`proxy.ts:36-40`) covers essentially every non-static path, so every navigation, every API call, and every Server Action pays that latency — on a free-tier project, against a possibly cold instance.

The DAL already made the better choice for the same job: `verifySession` uses `getClaims()` (`src/lib/auth/dal.ts:26`) with a well-reasoned comment about local JWKS verification. The proxy should match it — `getClaims()` refreshes the session when the token is near expiry just as `getUser()` does (per the installed `GoTrueClient.d.ts`: *"If the user's access token is about to expire when calling this function, the user's session will first be refreshed"*), which is the only thing the proxy actually needs.

```ts
// Refreshes the auth token and keeps the session cookie fresh.
// getClaims() verifies locally against cached JWKS — no round trip per request.
await supabase.auth.getClaims();
```

Also consider narrowing the matcher to exclude `/api/keepalive` and `/login`, which don't need a refreshed session.

---

### `createClient()` is not request-cached — several clients per request

**Severity: Low**

`src/lib/supabase/server.ts:5` correctly creates a new client per call (no module-level singleton — the important part is right). But it is not wrapped in React `cache()`, while its two main consumers both call it independently: `verifySession` (`src/lib/auth/dal.ts:25`), `getHouseholdId` (`dal.ts:44`), and `requireHousehold` (`src/lib/api/http.ts:71`) each construct their own. A single `/api/summary` request therefore builds three GoTrue clients, each with its own cookie view and its own potential refresh.

The individual *queries* are already well-deduplicated via `cache()` on `verifySession`, `getHouseholdId`, and `getHousehold`, so the practical cost is small — but two clients concurrently deciding to refresh the same token is a real (if rare) race.

```ts
import { cache } from 'react';
export const createClient = cache(async () => {
  const cookieStore = await cookies();
  return createServerClient<Database>(/* ... */);
});
```

Note this changes `getHousehold`'s `cache()` keying (`src/lib/queries/household.ts:19`) from incidental-identity to guaranteed-identity, which strictly improves the dedup that its own doc comment relies on.

---

### Sign-out has no CSRF protection and uses default global scope

**Severity: Low**

`src/app/auth/signout/route.ts:4-10` is a plain `POST` route handler. Unlike Server Actions, route handlers get no CSRF token from Next, so any cross-origin HTML form can POST here and force-log-out a signed-in user. Low impact (no data loss), but trivially avoidable — either move sign-out to a Server Action, or check `Origin`/`Sec-Fetch-Site`:

```ts
const origin = request.headers.get('origin');
if (origin && origin !== request.nextUrl.origin) return new Response(null, { status: 403 });
```

Two related notes on the same file:

- `signOut()` defaults to `scope: 'global'`, revoking the refresh token on *all* the user's devices. For a two-person household app that's probably surprising; `signOut({ scope: 'local' })` matches the "log out on this phone" intent.
- The cookie clearing goes through the `cookies()` store (via `server.ts`'s `setAll`), while the returned object is a freshly constructed `NextResponse.redirect`. Next does merge route-handler cookie-store mutations into the outgoing response, so this works — but it is worth an explicit test, and `@supabase/ssr` 0.12.4 now ships `clearAuthCookiesAtScopes` (`node_modules/@supabase/ssr/dist/main/clearAuthCookiesAtScopes.d.ts`) for the case where cookie `Domain`/`Path` changes between deploys leave unreachable stale cookies.

---

### All auth-callback failures are reported as "sign-ups are closed"

**Severity: Low**

`src/app/auth/callback/route.ts:26-28` maps *every* `exchangeCodeForSession` error to `?error=closed`. An expired link, a replayed code, a PKCE verifier mismatch, and a genuine Supabase outage all tell the user registration is closed. Distinguish at least the common cases:

```ts
if (error) {
  const reason =
    error.code === 'otp_expired' ? 'expired'
    : error.status === 403 ? 'closed'
    : 'unknown';
  console.error('auth callback failed', error);
  return NextResponse.redirect(`${origin}/login?error=${reason}`);
}
```

The allowlist itself is enforced in the right place — a DB trigger on `auth.users` (`supabase/migrations/0002_optional_allowlist.sql:35-39`) plus the dashboard signup toggle, not in client code. Good. But note 0002's header says it is optional and may not have been applied to the production project; the callback's `?error=closed` copy assumes it was.

---

### `config.toml` redirect URLs won't match a `localhost` dev session

**Severity: Low**

`supabase/config.toml` sets `site_url = "http://127.0.0.1:3000"` and `additional_redirect_urls = ["https://127.0.0.1:3000"]`. `next dev` prints and developers commonly use `http://localhost:3000`, which is a *different* origin to Supabase Auth's exact-match allowlist — an email link from the local stack will be rejected. The `https://` entry is also almost certainly a typo for the `localhost` variant, since local dev has no TLS (`[api.tls] enabled = false`).

```toml
additional_redirect_urls = ["http://localhost:3000", "http://localhost:3000/auth/callback", "http://127.0.0.1:3000/auth/callback"]
```

Two smaller local-dev notes in the same file:
- `[db.seed] sql_paths = ["./seed.sql"]` but no `supabase/seed.sql` exists — `supabase db reset` warns on every run. Either add a small seed (a household + categories makes manual testing much faster) or set `enabled = false`.
- `[auth] enable_signup = true` locally while production runs closed registration. Setting it to `false` locally would let the pgTAP suite actually exercise the `enforce_allowlist` trigger path that production depends on.

---

### `/api/keepalive` treats an RLS-filtered empty result as success

**Severity: Nit**

`src/app/api/keepalive/route.ts:17-18` builds an anon-key client with no session and selects from `households`. RLS (`households_select` → `is_household_member(id)`, `supabase/migrations/0003_households.sql:197`) evaluates `auth.uid()` as NULL, so this always returns `[]` with `error: null`. That still counts as database activity — which is the entire purpose (`route.ts:6-8`) — so the route works. But the check is vacuous: it would report `ok: true` even if RLS were entirely broken, and it will never detect a schema problem. Selecting from a table an anonymous role can genuinely read (or calling `select 1` via an RPC) would make the health signal meaningful.

---

### `process.env.X!` non-null assertions on required config

**Severity: Nit**

`src/lib/supabase/client.ts:6-7` and `src/lib/supabase/server.ts:13-14` use `!`. A missing env var produces an opaque supabase-js failure at first query rather than a clear boot error. `src/proxy.ts:7-11` already handles this gracefully (explicit check, skip refresh) — worth extending:

```ts
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}
```

---

### Realtime and Storage

**Severity: Nit** — Neither is used anywhere in `src/`, and neither is needed: the app is server-rendered with `revalidatePath` after each mutation (`src/app/actions/expenses.ts:36`, `src/app/actions/profile.ts:34-36`), and it stores no files. Absent by design; correct call. `supabase/config.toml` leaves `[realtime]`, `[storage]`, `[storage.vector]`, and `[analytics]` enabled, but those are stock local-stack defaults with no production effect — trimming them only speeds up `supabase start` in CI.

---

## What's done well

- **Modern cookie adapters throughout.** `getAll`/`setAll` in both `src/lib/supabase/server.ts:16-30` and `src/proxy.ts:14-27`; the deprecated `get`/`set`/`remove` triple (`CookieMethodsServerDeprecated` in the installed types) appears nowhere.
- **The proxy propagates refreshed cookies to *both* sides.** `src/proxy.ts:19-25` writes to `request.cookies` first, then rebuilds the response from the mutated request, then writes to `response.cookies` — exactly the pattern that avoids the classic dropped-refresh-cookie bug.
- **No `getSession()` anywhere on the server.** `verifySession` uses `getClaims()` (`src/lib/auth/dal.ts:26`), which verifies the JWT signature locally against JWKS and transparently falls back to a server round trip under symmetric HS256. The accompanying comment explains exactly why. No decoded-but-unverified JWT is trusted anywhere.
- **Authorization lives in a DAL, not in middleware.** `src/lib/auth/dal.ts:1-8` states the reasoning; every route handler goes through `requireHousehold` (`src/lib/api/http.ts:61-82`) and every Server Action re-verifies (`src/app/actions/expenses.ts:22`, `src/app/actions/profile.ts:21,50,80`), correctly treating Server Actions as directly POST-reachable endpoints.
- **Per-request server clients, singleton-free.** `createClient()` awaits `cookies()` inside the function, and the deliberate absence of an outer try/catch (`server.ts:6-9`) so Next's `DynamicServerError` can propagate is a subtle, well-documented, correct call.
- **No `service_role` key exists in the repo.** Only `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, correctly public-safe, correctly named for the new key scheme. `.env.local.example` and `README.md:19-20` match. Nothing sensitive is in a `NEXT_PUBLIC_` var.
- **Explicit column selection everywhere.** No `select('*')` in the codebase; shared column constants (`src/lib/mutations/expenses.ts:11-12`, `src/lib/mutations/categories.ts:13`) keep projections consistent between read and write paths.
- **Good `.single()` / `.maybeSingle()` discipline.** `.maybeSingle()` where absence is legitimate (`queries/cap.ts:17`, `queries/profile.ts:18`, `queries/expenses.ts:58`), `.single()` where a row must come back from an insert/upsert (`mutations/cap.ts:32`, `mutations/expenses.ts:43`). Update/delete use `.maybeSingle()` on a `select()` to distinguish "not found" from "changed", producing correct 404s (`api/expenses/[id]/route.ts:38,62`).
- **The join flow is already an atomic RPC.** `joinHousehold` delegates to `join_household` (`src/lib/mutations/household.ts:49-51`) instead of composing the cross-household merge client-side, and the route distinguishes the RPC's own `raise exception` messages from genuine failures rather than flattening everything to 400 (`src/app/api/household/join/route.ts:12-15,29-34`) — the one place error codes *are* thoughtfully handled.
- **Household scoping is belt-and-braces.** Every query and mutation adds `.eq('household_id', householdId)` even though RLS enforces the same (`is_household_member`), so an RLS regression degrades to empty results rather than cross-household leakage.
- **Currency is stamped server-side**, never accepted from the client, on both insert (`mutations/expenses.ts:22-29`) and update (`mutations/expenses.ts:64-68`, `api/expenses/[id]/route.ts:17`).
- **`cache()` used deliberately to collapse round trips.** `verifySession`, `getHouseholdId` (`dal.ts:24,42`) and `getHousehold` (`queries/household.ts:19`), the last with a comment explaining precisely which three call sites would otherwise each re-read.
- **The two-query member lookup is justified**, not an accidental N+1: `getHouseholdMembers` (`queries/household.ts:44-59`) explains that no FK exists between `household_members` and `profiles`, then batches the second query with `.in(...)` rather than looping. Correct handling of a real PostgREST limitation.
- **CI runs the real database.** `.github/workflows/ci.yml` does `supabase start` → `npm run test:db` (pgTAP) → `supabase stop`, so migrations and RLS policies are exercised on every PR, not just mocked.
- **Generated types are actually current** — `profiles.locale` from migration 0004 and the whole 0003 household pivot are all reflected in `database.types.ts`, and `mappers.ts:20-30` derives its Row types from the generated `Database` rather than hand-maintaining them.
- **The domain/row split is clean.** `src/lib/types.ts` holds camelCase domain types with a branded `Money`, mapped at the data-access edge (`mappers.ts`) — this is deliberate modelling, not duplication of the generated types.
