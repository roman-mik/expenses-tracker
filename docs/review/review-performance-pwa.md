## Performance & PWA

### Overall assessment

Two of the premises I was handed turned out to be **wrong on inspection**, and correcting them changes the shape of this review:

1. **Home does not run ~5 sequential Supabase queries.** `src/app/page.tsx:39-44` already uses `Promise.all`, and `getHousehold` is `cache()`-wrapped so the three call sites collapse to one round-trip (`src/lib/queries/household.ts:19`). The real serial depth is **4 network hops**, not 5+, and only one of them is trivially removable. Server-side latency is still the dominant cost, but the fix is different from "add Promise.all".
2. **`src/proxy.ts:31` is a real cost, but the DAL is not double-authenticating over the network.** `verifySession` uses `getClaims()`, which verifies the JWT *locally* with asymmetric keys (`src/lib/auth/dal.ts:26`). So the proxy's `getUser()` is the *only* Auth round-trip — but it's a wholly unnecessary one on every request, including all 12 `/api` routes.

The genuine headline problems are: **~160 KB gzip of shared JS before a single byte of app code** (measured), **the full `@supabase/supabase-js` client — auth-js *and* realtime — shipped to the browser on `/login` at 64 KB gzip** (measured, and realtime is never used), **the entire i18n message catalogue inlined into every HTML response regardless of which keys the page uses** (measured: 7.6 KB raw of a 20.3 KB login page), and **no `regions` in `vercel.json`** so every one of those 4 serial Supabase hops crosses the Atlantic twice.

On PWA: the premise "no service worker, misleading banner" is **half right**. There is genuinely no service worker — confirmed. But `OfflineBanner` is *not* a `navigator.onLine` lie; it uses Next 16's `experimental.useOffline` (`next.config.ts:8`, `src/components/pwa/OfflineBanner.tsx:14`), which really does queue and retry Server Actions. Its copy is honest for the soft-navigation case and **dishonest for the cold-launch case**, which is exactly the case an installed home-screen icon creates. That's the bug.

Rough priority: fix `vercel.json` regions (one line, biggest latency win), drop the proxy `getUser()`, split the Supabase client off `/login`, then Suspense boundaries.

---

### Measured numbers

**Environment:** `next build` (Next 16.3.0, Turbopack) with placeholder Supabase env vars, then `next start` on :3999 and `curl`. Build exited 0.

⚠️ **Next 16.3 + Turbopack no longer prints a First Load JS table.** The route list it emits has no size column, and it does not write `app-build-manifest.json`. So I reconstructed the table by parsing each route's `.next/server/app/**/page_client-reference-manifest.js` for its `static/chunks/*.js` set, unioning with `build-manifest.json`'s `rootMainFiles` + `polyfillFiles`, and gzip -9'ing the actual files on disk. **These are measured bytes, not estimates**, but the grouping is my reconstruction rather than Next's own accounting — treat ±5% as reconstruction noise.

#### First Load JS per route (measured, gzip)

| Route | Route-only JS | First Load JS (gz) | First Load (raw) | modern-browser gz¹ |
|---|---:|---:|---:|---:|
| `/login` | 92.3 KB | **258.3 KB** | 871 KB | 219.8 KB |
| `/categories` | 33.4 KB | 199.4 KB | 642 KB | 160.9 KB |
| `/history` | 32.9 KB | 198.9 KB | 639 KB | 160.4 KB |
| **`/` (home)** | 32.6 KB | **198.6 KB** | 638 KB | **160.1 KB** |
| `/add` | 32.2 KB | 198.3 KB | 637 KB | 159.8 KB |
| `/edit/[id]` | 32.2 KB | 198.3 KB | 637 KB | 159.8 KB |
| `/cap` | 32.0 KB | 198.0 KB | 636 KB | 159.5 KB |
| `/household` | 31.9 KB | 198.0 KB | 636 KB | 159.5 KB |
| `/settings` | 31.7 KB | 197.7 KB | 636 KB | 159.2 KB |
| `/_not-found` | 27.0 KB | 193.0 KB | 624 KB | 154.5 KB |
| **Shared by all** | — | **166.1 KB** | 540 KB | **127.6 KB** |

¹ Excluding the 110 KB / 38.5 KB gz legacy polyfill chunk (`0cz1d0mv5g_q7.js`), which modern mobile browsers skip. The honest mobile number for home is **~160 KB gzip**.

#### Largest individual chunks (measured, gzip -9)

| Chunk | raw | gzip | What it is | Loaded on |
|---|---:|---:|---|---|
| `1malqqxllcmyy.js` | 229 KB | 71.0 KB | React 19 + Next runtime | every route (shared) |
| `2xbvangpea8rk.js` | 248 KB | **64.0 KB** | **`@supabase/supabase-js`** — grepped: `GoTrueClient`×3, `RealtimeClient`×2, `createBrowserClient`×5, SIWE/passkey/OTP code paths | **`/login` only** |
| `0cz1d0mv5g_q7.js` | 110 KB | 38.5 KB | legacy polyfills | every route |
| `0yqhfewppuu6o.js` | 127 KB | 34.0 KB | Next client router | every route (shared) |
| `3v7he1s836qar.js` | 40 KB | **11.0 KB** | **next-intl runtime** — grepped: `IntlMessageFormat`, `@formatjs/intl-pluralrules` | **every route** |

#### Server payload (measured against a running `next start`)

- `GET /login` HTML: **20,383 bytes raw / 5,806 bytes gzip**, TTFB 8 ms (localhost, no real Supabase — so this measures *render* cost only, not network).
- `messages/en.json`: 7,629 B raw / 2,842 B gzip → **~37% of the login page's raw HTML, ~49% of its gzipped bytes.**
- `messages/ru.json`: 11,165 B raw / 3,758 B gzip → Russian users pay ~55% raw.
- Confirmed by grep that `/login`'s HTML contains `Home.leftToSpend`, `PWA.installIOS`, and `PWA.offline` — **keys no component on that route can possibly render.**
- `GET /api/keepalive` → `401` in 17.8 ms. The proxy matcher (`src/proxy.ts:38`) does not exclude `/api`, so this request paid a `supabase.auth.getUser()` before the handler ran. Confirmed by inspection of the matcher regex.

#### Icon assets (measured)

| File | Dimensions | Bytes |
|---|---|---:|
| `public/icon-192.png` | 192×192 | 3,517 |
| `public/icon-512.png` | 512×512 | 10,403 |
| `public/icon-maskable-512.png` | 512×512 | 5,293 |
| `src/app/apple-icon.png` | 180×180 | 1,842 |

#### What is estimated, not measured

Everything involving **real network latency** — iad1↔EU RTT, Supabase query time, TTFB in production. I have no production access. All latency figures below are labelled **[estimated]** and built from a stated 90 ms iad1↔eu-central RTT assumption. The *count* of round trips is measured (read off the code); only the per-trip cost is assumed.

---

### Part A — Performance

#### 1. Server-side latency chain — the centrepiece

**Severity: Critical**

The measured serial round-trip chain for a cold, authenticated `GET /`:

| # | Hop | Code | Serial? |
|---|---|---|---|
| 1 | Proxy `supabase.auth.getUser()` → Supabase **Auth** | `src/proxy.ts:31` | yes, blocks the RSC render entirely |
| 2 | `getHouseholdId()` → `household_members` | `src/lib/auth/dal.ts:44-49` | yes |
| 3 | `getHousehold()` → `households` | `src/app/page.tsx:34` → `household.ts:23` | yes |
| 4 | `Promise.all` of 4 queries: `getSummary` (which itself parallelises `budget_settings` + a *cached* `getHousehold`, then serially reads `expenses`), `listExpenses`, `getCategories`, `getHouseholdMembers` (2 serial reads: `household_members`, then `profiles`) | `page.tsx:39-44` | parallel batch, but **2 levels deep inside** |

`verifySession` (`dal.ts:24-30`) is **not** in this list — `getClaims()` verifies locally, no network. Credit where due.

So: **4 serial network levels**, the deepest branch being proxy → household_members → households → (summary's expenses read) / (members' profiles read).

**[estimated] TTFB, iad1 function ↔ EU Supabase, ~90 ms RTT:**

```
proxy getUser()        ~110 ms  (auth server, not just a DB hop)
getHouseholdId          ~95 ms
getHousehold            ~95 ms
parallel batch          ~190 ms  (two-deep: getSummary's expenses read,
                                  getHouseholdMembers' profiles read)
RSC render + serialize   ~20 ms
------------------------------
TTFB                    ~510 ms   on top of DNS+TLS+cold start
```
Add a Vercel Hobby cold start (~250-400 ms for a Node function) and a 4G handshake and you are plausibly at **1.2-1.8 s to first byte**. On the same continent as Supabase the chain drops to roughly **~180 ms**.

**Fixes, in order of value per line of code:**

**(a) Pin the region to Supabase's — one line, ~55% of the win.** `vercel.json` has `crons` but no `regions`:

```json
{
  "regions": ["fra1"],
  "crons": [{ "path": "/api/keepalive", "schedule": "0 6 * * *" }]
}
```
Use whichever of `fra1`/`arn1`/`lhr1` matches the Supabase project region. This is the single highest-leverage change in the whole review: it turns four ~90 ms hops into four ~10 ms hops.

**(b) Delete the proxy's `getUser()` round-trip.** `src/proxy.ts:31` exists to refresh the session cookie, but it pays an Auth-server call to do it. `getSession()`/`getClaims()` refreshes the token from the refresh-token cookie without a network call when the JWT is still valid. Since `dal.ts` is (correctly, per its own docstring) the real authorization boundary, the proxy only needs to keep cookies fresh:

```ts
// src/proxy.ts:31
await supabase.auth.getClaims();   // local verify; only hits the network to refresh an expired token
```

**(c) Exclude `/api` (and `auth/`) from the proxy matcher.** API handlers do their own auth; the proxy's cookie-setting response is discarded for them anyway.

```ts
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```
Measured effect: `/api/keepalive`, `/api/summary`, `/api/expenses` etc. each shed one Auth round-trip — **[estimated] ~110 ms per API call** at current region placement.

**(d) Collapse hops 2+3 into one query.** `getHouseholdId` reads `household_members`, then `getHousehold` reads `households` — a plain FK join PostgREST can embed:

```ts
// src/lib/auth/dal.ts — replaces getHouseholdId + the page's getHousehold call
export const getMembership = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('household_members')
    .select('household_id, households(id, currency, timezone)')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { householdId: data.household_id, household: toHousehold(data.households) };
});
```
Then seed `getHousehold`'s cache with the result (or pass the household down) so `getSummary`/`listExpenses` don't re-fetch. **Removes one full serial level.**

**(e) Flatten `getHouseholdMembers`' two serial reads.** `household.ts:44-57` does `household_members` then `profiles` because there is no direct FK. Fix it in the database instead of the app: add a view, or an `FK profiles.id → auth.users.id` mirror that PostgREST can embed. Cheaper still — for the home page, members are only used for the `shared` boolean and name attribution on today's expenses. Move it behind a Suspense boundary (see §3) so it never blocks the hero.

**(f) `getSummary` re-reads all of the month's expenses that `listExpenses` already read.** `summary.ts:51-56` selects `amount_minor, currency, category_id` for the month; `expenses.ts:23-35` selects a superset of the same rows for the same window (`page.tsx:41`). Two identical-cardinality scans in the same parallel batch. Either derive the summary from the `listExpenses` result in memory, or move the aggregation into a Postgres RPC that returns both. For a household with a few hundred rows/month this is bandwidth, not CPU — but it is a wholly duplicated round trip.

---

#### 2. Bundle: the Supabase client on `/login` is 64 KB gzip of mostly-unused code

**Severity: High**

Measured: `/login` First Load JS is **258.3 KB gzip**, 60 KB more than every other route, and `2xbvangpea8rk.js` (248 KB raw / **64.0 KB gzip**) is the whole of `@supabase/supabase-js`. Grepping the chunk finds `RealtimeClient` (this app has no realtime feature), plus SIWE (Sign-In With Ethereum), passkey, phone-OTP and MFA code paths — none of which `src/components/auth/LoginForm.tsx` uses.

The login page is the **first page a new user ever loads**, on a phone, on mobile data, and it is the heaviest route in the app.

**Fix — move the auth call server-side.** `LoginForm.tsx` only needs to send an email and get a result back. Replace the browser Supabase client with a Server Action:

```ts
// src/app/actions/auth.ts
'use server';
import { createClient } from '@/lib/supabase/server';

export async function sendMagicLink(email: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
  });
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}
```
`LoginForm` then calls `sendMagicLink` in a `useTransition` and never imports `@supabase/ssr`. **Measured saving: 64 KB gzip / 248 KB raw off `/login`**, taking it from 258 KB to ~194 KB gzip — in line with every other route. This also means the anon key never needs to be exercised client-side for auth.

If a browser client must stay (e.g. for `onAuthStateChange`), at minimum disable realtime and lazy-import it behind the submit handler rather than at module scope.

---

#### 3. The shared 127.6 KB gzip baseline and the i18n payload

**Severity: Medium**

**Budget I'm holding this to:** for a mobile-first PWA whose core interaction is "two taps at a checkout counter", the right target is **≤ 100 KB gzip First Load JS on the home and add routes**, and **≤ 130 KB on any route**. Justification: on a 4G connection at ~1.6 Mbps effective throughput with ~150 ms RTT, 100 KB gzip is roughly 1 s of transfer plus parse; 160 KB is closer to 1.6-1.8 s of JS work before the app is interactive, which on a mid-tier Android is the difference between "instant" and "did it register my tap". Home currently measures **160.1 KB gzip** (modern) — **60% over budget**.

Of that 160 KB, ~128 KB is the React 19 + Next 16 App Router floor and is not realistically reducible. So the actionable slice is the ~32 KB of route JS, of which **11.0 KB gzip is the next-intl runtime** (`3v7he1s836qar.js`, containing `IntlMessageFormat` and `@formatjs/intl-pluralrules`) — measured present on **every** route.

**Is next-intl's message bundle material?** For *JS bytes*: 11 KB gz of runtime, yes, that's a third of the route-level JS. For *HTML bytes*: measured 2,842 B gz (en) / 3,758 B gz (ru) inlined into **every dynamic HTML response and every RSC navigation payload**, and since every page is dynamic, none of it is ever cached. On the login page that is **~49% of the gzipped HTML**, carrying keys like `Home.leftToSpend` and `PWA.installIOS` that route cannot render.

**Fix — scope the client provider to the namespaces that client components actually use.** `src/app/layout.tsx:54` renders `<NextIntlClientProvider>` with no `messages` prop, which serializes the whole catalogue. next-intl supports narrowing:

```tsx
// src/app/layout.tsx
import { getMessages } from 'next-intl/server';
import pick from 'lodash/pick'; // or a 3-line local pick — don't add lodash

const messages = await getMessages();

<NextIntlClientProvider
  messages={pick(messages, ['Common', 'Nav', 'PWA', 'Toast', 'HistoryList'])}
>
```
Server components keep full access via `getTranslations` (`page.tsx:60`, `DailySpendChart.tsx:22`) — only the *client* bundle shrinks. **[estimated] ~40-60% of the inlined message bytes**, i.e. ~1.2-1.7 KB gzip off every single response, on top of removing keys that leak page structure to routes that don't use them.

**Is anything else pulled client-side that shouldn't be?** Reviewed all 12 `'use client'` leaves. They are genuinely interactive (forms, toasts, popover, install prompt) and the boundaries are placed at the leaves, not at page level — this is done correctly. `DailySpendChart` is a *server* component rendering hand-rolled CSS bars with zero charting library (`DailySpendChart.tsx:16`), which is the right call and worth preserving. The one questionable one is `AppHeader` (`AppHeader.tsx:1`) — it is client-only for a native Popover positioning effect, and it renders on every page. It's small, but if you want the last few KB, the popover positioning could move to CSS anchor positioning behind `@supports` with the JS as fallback.

---

#### 4. Zero Suspense boundaries — the hero blocks on the slowest query

**Severity: High**

Confirmed: no `<Suspense>` anywhere in `src/app` or `src/components`. `page.tsx:39` awaits all four queries before returning a single byte.

The consequence is concrete: the hero number ("Left to spend") depends only on `getSummary`. But it cannot render until `getHouseholdMembers` has completed **two** serial reads (`household.ts:44-57`) and `listExpenses` has scanned the month — neither of which the hero needs. **The most important pixel on the page waits on the least important query.**

**Is route-level `loading.tsx` enough?** No, and it's worth being precise about why. `src/app/loading.tsx` is genuinely good — it's a hand-matched skeleton, not a spinner, and it makes *soft navigations* feel instant. But it only helps navigations *into* the route. It does nothing for the **initial page load / cold launch**, which for a PWA opened from a home-screen icon is the *only* load that happens. On that path the user sees a blank document until the full 4-level chain resolves. Suspense boundaries stream the shell immediately on that path too.

**Recommended boundaries** — three tiers, matching the visual hierarchy:

```tsx
// src/app/page.tsx (sketch)
export default async function Home() {
  const user = await verifySession();
  if (!user) redirect('/login');
  const membership = await getMembership(user.id);   // §1(d): one hop
  if (!membership) redirect('/login');

  return (
    <main className="flex-1 flex justify-center px-6 py-12">
      <div className="w-full max-w-xl lg:max-w-5xl lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
        <div className="flex flex-col gap-8">
          <AppHeader />                              {/* static, streams instantly */}

          {/* Tier 1: the hero. Only needs getSummary. */}
          <Suspense fallback={<SpentBarSkeleton />}>
            <HeroSection membership={membership} />
          </Suspense>

          <Button href="/add" variant="primary" className="py-4 text-center">
            {t('addExpense')}
          </Button>

          {/* Tier 2: today's list. Needs expenses + categories + members. */}
          <Suspense fallback={<TodayListSkeleton />}>
            <TodaySection membership={membership} userId={user.id} />
          </Suspense>

          <InstallPrompt />
        </div>

        {/* Tier 3: desktop-only chart. Never blocks mobile at all. */}
        <div className="hidden lg:flex lg:flex-col lg:gap-8">
          <Suspense fallback={<ChartSkeleton />}>
            <ChartSection membership={membership} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
```

Two things this unlocks beyond streaming:

- **The "Add expense" button and `AppHeader` become part of the static shell**, painting before *any* Supabase query resolves. For an app whose pitch is "every expense in two taps", getting the Add button interactive first is the single most valuable streaming decision available.
- **It makes `experimental.useOffline` actually work as designed.** The Next docs are explicit (`node_modules/next/dist/docs/01-app/02-guides/offline-support.md`): the prefetched shell renders offline, and the Suspense fallbacks sit pending until the network returns. Right now, with the whole page inside one implicit boundary, an offline soft-navigation to `/` shows the `loading.tsx` skeleton with no granularity. With boundaries, the header and Add button are usable offline.

**Pair the fallbacks with `useOffline`** so a pending boundary explains itself instead of pulsing forever (see Part B §2).

**Note on `lg:hidden`:** `DailySpendChart` is rendered inside a `hidden lg:flex` wrapper (`page.tsx:179`), meaning **mobile users pay for `dailyTotals()` computation and the chart's full serialized RSC payload — including a `<ul className="sr-only">` with one `<li>` per day of the month (`DailySpendChart.tsx:68-74`) — and then CSS-hide it.** That's dead payload on the exact device class you're optimizing for. Move the chart behind a boundary that a mobile viewport never requests, or accept it as a deliberate trade for the responsive layout — but it should be a decision, not an accident.

---

#### 5. Caching: more is safe than you'd think

**Severity: Medium**

Everything is `ƒ` (dynamic) in the build output because `createClient()` awaits `cookies()` (`src/lib/supabase/server.ts:10`) and `getLocale()` reads a cookie (`layout.tsx:46`). That is correct — the data is per-household and must never be shared across users. But "the *data* is private" doesn't mean "the *shell* must be dynamic."

**What is safely cacheable:**

1. **The static shell.** With the Suspense boundaries from §4, the header, the Add button, the layout chrome, and the section headings contain zero per-household data. Under Next 16's `cacheComponents`, that shell becomes prerenderable and CDN-cacheable, with only the dynamic islands fetched per-request. This is the same mechanism that makes offline soft-navigation work.

2. **Categories.** `getCategories` (`categories.ts`) reads a list that changes maybe monthly, and every mutation already calls `revalidatePath('/categories')` + `revalidatePath('/')` (`src/app/actions/categories.ts:37-39`). This is a textbook `'use cache'` candidate keyed by household:

```ts
// src/lib/queries/categories.ts
import { unstable_cacheTag as cacheTag, unstable_cacheLife as cacheLife } from 'next/cache';

export async function getCategories(supabase, householdId) {
  'use cache';
  cacheTag(`categories:${householdId}`);
  cacheLife('hours');
  // ...existing query
}
```
Then swap the blunt `revalidatePath('/')` in `actions/categories.ts` for `revalidateTag(\`categories:${householdId}\`)`. **Critical:** the cache key must include `householdId` and the function must not close over the request-scoped `supabase` client — pass household-scoped params and build a service-role client inside, or the cache will leak one household's categories to another. Get this wrong and it is a data-isolation bug, not a perf regression. If that feels risky, skip it: categories is one cheap indexed read.

3. **Household row (currency/timezone).** Same shape as categories, changes even less often. Same caveat.

**What must stay dynamic:** `getSummary`, `listExpenses`, `getHouseholdMembers`. These are the live numbers, and in a shared household a second member's expense must appear on the first member's next load. Caching them would show stale spend totals — exactly the thing this app exists to get right.

**Also worth noting:** `revalidatePath('/')` in `actions/expenses.ts:37,72,93` is currently a no-op-ish blunt instrument since `/` is fully dynamic anyway. Once the shell is cached, these become meaningful and should be narrowed to tags.

---

#### 6. The double-revalidation pattern: two round trips per mutation

**Severity: Medium**

Measured: `revalidatePath` appears 16 times across `src/app/actions/*.ts`, and `router.refresh()` appears in 8 client components (`HistoryList.tsx:105`, `CategoryManager.tsx:87,104,119,270`, `HouseholdPanel.tsx:36,75`, `DisplayNameForm.tsx:28`, `LocaleForm.tsx:30`, `SetCapForm.tsx`, `LoginForm.tsx:37`).

The comment at `HistoryList.tsx:104` states the reasoning: *"The action revalidated the server data; refresh to drop the row."* This is a **misconception**. A Server Action invoked from a client component already returns the re-rendered RSC payload for any path it revalidated, in the *same* response. The subsequent `router.refresh()` fires a **second** full RSC request — which, given §1, means a second trip through the proxy `getUser()` and the whole 4-level query chain.

**On a bad mobile connection, deleting one expense costs two full server round trips instead of one.** [estimated] ~1 s instead of ~500 ms at current region placement.

**Fix:**
```ts
const remove = () => {
  startTransition(async () => {
    const result = await deleteExpense(e.id);   // revalidatePath('/') inside already
    if (result.ok) {                            // returns the fresh RSC payload with it
      toast.success(t('expenseRemoved'));
      // router.refresh();  ← delete: the action's response already updated the tree
    } else {
      toast.error(result.error);
      setConfirming(false);
    }
  });
};
```

Two genuine exceptions to keep:
- `LoginForm.tsx:37` — after `signInWithOtp` the auth cookie changed via a non-action path; `refresh()` is correct there.
- `LocaleForm.tsx:30` — `actions/profile.ts:68` notes the locale lives in a cookie, not revalidated data, so `revalidatePath('/', 'layout')` alone doesn't re-read it. Correct as-is.

`HouseholdPanel.tsx:32,60` calls `fetch('/api/household/invite')` and then `router.refresh()` — those are route handlers, not Server Actions, so the refresh *is* needed. But they'd be better as Server Actions, which would collapse them to one trip **and** make them retry-on-reconnect under `useOffline` (see Part B §2 — this is the correctness angle, not just perf).

**Re-render behaviour** is otherwise fine: `startTransition` is used consistently, `useSyncExternalStore` is used correctly for client detection (`InstallPrompt.tsx:23-29`), and there are no `setState`-in-effect patterns.

---

#### 7. Core Web Vitals

**Severity: Medium**

**LCP — the main risk.** The LCP element is the big `text-5xl` remaining-amount span (`page.tsx:82-89`). Two compounding problems:
- It sits behind the full 4-level query chain (§1). [estimated] LCP on 4G with EU-latency Supabase: **2.5-3.5 s**, i.e. borderline-to-failing the 2.5 s "good" threshold. After the `regions` fix and Suspense boundaries: **[estimated] ~1.2-1.6 s.**
- It renders in **Caprasimo** via `next/font/google` (`layout.tsx:22`). `next/font` self-hosts and preloads with `font-display: swap` by default, which is right — but a swap on the single largest text element is a visible reflow. Consider `adjustFontFallback` (on by default for Google fonts) — verify the metric overrides are actually being applied, and consider whether the hero number would be better in the body font, which is already loaded for the surrounding chrome.

**CLS — low risk, well handled.** `src/app/loading.tsx` is a genuinely hand-matched skeleton: same `max-w-xl`, same `gap-8`, same `rounded-lg bg-surface shadow-md p-7`, same section order. This is the right way to do it and it should hold CLS near zero on soft navigation. Two gaps: (a) the skeleton is `max-w-xl` while the loaded page is `max-w-xl lg:max-w-5xl lg:grid lg:grid-cols-2` (`page.tsx:64`) — **desktop will shift layout when the real page arrives**; (b) `NudgeBanner` and `OfflineBanner` are conditional and unreserved, so both insert content above the fold when they appear. The offline banner in particular appears *after* hydration, pushing the whole page down.

**INP — low risk.** Interactions are small: a native popover, form submits in transitions, a toast. No heavy client work. The 160 KB gzip of JS is a TBT/hydration cost more than an INP one, but on a low-end Android the hydration window is where a fast tap gets dropped.

**Chart paint.** `DailySpendChart.tsx:59` puts `transition-[height]` on up to 31 absolutely-sized bars. On first paint these animate from nothing, which is wasted compositing on a page that hasn't finished loading, and `height` transitions trigger layout on every frame rather than compositing (unlike `transform: scaleY`). Since it's `lg:`-only this doesn't hit phones — but if the chart ever comes to mobile, switch to `transform: scaleY()` with `transform-origin: bottom`.

**Speed Insights is installed** (`layout.tsx:59`, `@vercel/speed-insights@2.0.0`) and correctly placed. Watch, in order:
1. **TTFB on `/`** — this is your real problem and Speed Insights reports it directly. Expect the `regions` fix to show up here as a step change.
2. **LCP on `/`**, split by device — the mobile p75 is the number that matters.
3. **CLS on `/` desktop** — should catch the `max-w-xl` vs `max-w-5xl` skeleton mismatch above.
4. **INP on `/add`** — the two-tap flow; if this degrades, hydration cost is biting.

Note that Speed Insights and Analytics (`layout.tsx:58-59`) each add a small script; they're worth it, but they are part of your budget.

---

#### 8. Performance budget and CI enforcement

**Severity: Low (process)**

**Recommended budget:**

| Metric | Budget | Current (measured) |
|---|---|---|
| Shared First Load JS (gz, modern) | ≤ 110 KB | 127.6 KB ❌ |
| First Load JS, `/` and `/add` (gz, modern) | ≤ 130 KB | 160.1 KB ❌ |
| First Load JS, any route (gz, modern) | ≤ 150 KB | 219.8 KB (`/login`) ❌ |
| Inlined i18n messages per response (gz) | ≤ 2 KB | 2.8 KB (en) / 3.8 KB (ru) ❌ |
| LCP p75, mobile | ≤ 2.0 s | unknown — watch Speed Insights |
| TTFB p75 | ≤ 400 ms | unknown |

The `/login` line should be achievable immediately by §2; the rest need the i18n narrowing and accepting the framework floor. If 110 KB shared proves impossible on Next 16, raise it to 130 KB rather than ignoring the budget.

**Cheapest enforcement.** Since Turbopack no longer prints sizes, a size-limit tool that reads the build manifest is the pragmatic path. Commit the measurement script and gate on it:

```yaml
# .github/workflows/perf-budget.yml
- run: npm ci
- run: NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
       NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_placeholder \
       npm run build
- run: node scripts/check-bundle-budget.mjs
```

`scripts/check-bundle-budget.mjs`: read `.next/build-manifest.json` for `rootMainFiles`, union each route's `.next/server/app/**/page_client-reference-manifest.js` chunk set, gzip the files, compare against a committed `budget.json`, exit 1 on regression. That is ~40 lines and exactly the logic I used to produce the table above — it needs no new dependency and no Lighthouse runner. Print a per-route diff against the committed baseline in the failure message so a regression names the route that caused it.

Add `@next/bundle-analyzer` as a manual `npm run analyze` for investigation, but don't put it in CI — it's for humans.

---

### Part B — PWA & Offline

#### 1. There is no service worker. The installed app cannot cold-launch offline.

**Severity: High**

**Verified.** `public/` contains exactly six files: `icon-192.png`, `icon-512.png`, `icon-apple.svg`, `icon-maskable-512.png`, `icon.svg`, `icon.svg`. No `sw.js`, no `service-worker.js`, no Workbox output. Grepping `src/` finds no `navigator.serviceWorker.register` anywhere. `next.config.ts` has no PWA plugin — only `experimental.useOffline`, which per Next's own documentation is **not** a service worker.

The Next 16 docs state this explicitly (`node_modules/next/dist/docs/01-app/02-guides/offline-support.md`):

> *"This feature only applies to soft navigations into prefetched routes and Server Action calls from the current page. **A full page reload while offline still fails because the browser needs the network to deliver the HTML**; full offline loads would need a service worker."*

**The user-facing consequence, stated plainly:** the manifest (`src/app/manifest.ts`) makes Kapa installable with `display: 'standalone'`. A user installs it. Later they tap the home-screen icon on the subway, or in a shop with one bar. A standalone-mode launch is a **cold document request**. There is no cached HTML to serve it. They get **the browser's network-error page, chrome-less, inside what looks like a native app** — no back button, no address bar, no way to understand what went wrong. It reads as "the app is broken," not "you're offline."

This is worse than not being installable at all. Installation is a promise of app-like reliability, and this app currently takes that promise and fails it in the exact situation the user most needs the app.

---

#### 2. Is `OfflineBanner` honest? Partly — and the dishonest part is the launch path.

**Severity: High**

First, a correction to the review premise: **`OfflineBanner` does not use `navigator.onLine`.** It uses Next 16's `useOffline` hook (`src/components/pwa/OfflineBanner.tsx:3,14`), enabled by `experimental.useOffline` in `next.config.ts:8`. Per Next's docs this is genuinely better than `navigator.onLine` — it enters the offline state either from the browser `offline` event **or** from any failed navigation/prefetch/Server Action fetch, and confirms recovery by polling `HEAD` with backoff (500 ms → 1 s → 2 s → 3 s cap). It correctly catches the captive-portal / "WiFi with no upstream" case that `navigator.onLine` gets wrong. **The detection is sound.**

The promise is the problem. `messages/en.json` `PWA.offline`:

> *"You're offline. Anything you add will go through the moment you're back."*

And the component's own docstring (`OfflineBanner.tsx:8-11`) claims: *"pending expenses, cap changes, and category edits all go through Server Actions, so they quietly retry and land once the network is back."*

**Where the promise holds:** expense add/edit/delete, cap changes, and category CRUD do go through Server Actions (`src/app/actions/expenses.ts`, `cap.ts`, `categories.ts`), and `experimental.useOffline` genuinely queues and replays those on reconnect, with no client retry code. For a user who already has the page open and taps "Add expense", the banner tells the truth.

**Where it breaks — three distinct ways:**

1. **The banner can never be seen on the launch path.** If the user cold-launches offline, no HTML is delivered, so no React, so no banner. The message that would reassure them is itself gated behind the network. The user gets a browser error page instead. The banner is honest only for users who already got the page.

2. **`HouseholdPanel` is not covered.** `HouseholdPanel.tsx:32` and `:60` use `fetch('/api/household/invite')` and `fetch('/api/household/join')` — plain client fetches, not Server Actions. The Next docs are explicit that *"Requests you issue directly with `fetch()` inside a Client Component… stay under that library's own retry policy."* These will throw a network error while the banner promises they'll "go through". **The docstring's claim is wrong for this component.** Either convert them to Server Actions (also fixes the double round-trip from §6) or the banner's promise needs qualifying.

3. **Retry is in-memory and dies with the tab.** The `useOffline` queue lives in the page's JS heap. If the user adds an expense offline and the OS kills the backgrounded PWA — routine on iOS under memory pressure, and *especially* likely for a tab left open in a shop — the queued expense is gone, silently. The user was told "it will go through." It did not. **This is the trust bug**: not that the banner lies about connectivity, but that it promises durability the implementation doesn't have.

**Minimum honest fix** (do this even if you do nothing else): soften the copy to promise only what's true, and cover the launch path separately.

```json
"offline": "You're offline. Keep this screen open — anything you add will send as soon as you're back."
```
The "keep this screen open" is the load-bearing clause: it is the difference between a promise the code keeps and one it doesn't.

Also make the Suspense fallbacks from Part A §4 offline-aware, so a pending boundary explains itself instead of pulsing indefinitely:

```tsx
// src/components/ui/ConnectivityFallback.tsx
'use client';
import { useOffline } from 'next/offline';
import { useTranslations } from 'next-intl';

export function ConnectivityFallback({ children }: { children: React.ReactNode }) {
  const isOffline = useOffline();
  const t = useTranslations('PWA');
  return isOffline
    ? <p className="text-sm text-ink/60">{t('waitingForConnection')}</p>
    : <>{children}</>;   // the existing skeleton
}
```

---

#### 3. Should this app work offline? Yes — ship tier (b) now, tier (d) next.

**Severity: High (product decision)**

**Firm recommendation: implement tier (b) immediately, and commit to tier (d) scoped to expense creation only.** Not (a), not (c).

**Why not (a) "do nothing, remove the banner".** The banner is not the problem; the missing shell is. And removing it makes things worse — you'd delete the one honest signal the user gets while leaving the broken cold-launch intact. Rejected.

**Why (b) is non-negotiable.** An app-shell cache is perhaps 30 lines of service worker and it converts "chrome-less browser error page" into "your app, with an honest message." Given the app is *already* installable and *already* marketed with `display: 'standalone'`, this is not a feature — it is repairing a promise the manifest already made. Ship it regardless of what else you decide.

**Why not (c) "full offline read cache".** Caching last-known summary and expense list sounds appealing but delivers the least value per unit of risk. The core number this app displays — "left to spend" — is *shared household state*. Showing a stale "€240 left" to someone standing in a shop, when their partner spent €80 an hour ago, is **actively worse than showing nothing**, because it invites a spending decision on wrong data. A read cache in a multi-user household needs staleness UI ("as of 3 hours ago") to be safe, and once you're building that you've done most of (d)'s work for a fraction of (d)'s benefit. Skip it as a destination — though (d) will incidentally cache reads, and *then* it's fine, because (d) gives you the write path that makes stale reads recoverable.

**Why (d), scoped.** The task framing is right about the core moment: standing at a checkout counter with bad reception is exactly when an expense gets logged, and it's the moment where a lost entry means the month's data is silently wrong. The current in-memory retry (§2) handles a flaky-network tap but **not** a killed tab — and a phone in a pocket in a shop is the single most likely place for iOS to reclaim that tab.

The conflict-model objection is real but much smaller than it first appears, **because expenses are append-only inserts, not edits.** Two people adding expenses concurrently is not a conflict — it's two rows. There is no merge, no last-write-wins, no vector clock. The hard multi-user cases are *editing* and *deleting* an expense someone else touched, and *changing the cap* — and those are precisely the operations you should **refuse to queue offline**. So:

- **Queue offline:** expense *creation* only. Append-only, idempotent with a client-generated UUID, no conflict semantics needed.
- **Never queue:** edits, deletes, cap changes, category CRUD, household join/invite. These require the user to see current server state. Offline, disable them with an explanatory message.

That scoping is what makes (d) affordable. It is an IndexedDB outbox, a client UUID as the insert's primary key (so a double-send is a no-op via `ON CONFLICT DO NOTHING`), and a Background Sync registration with a foreground-replay fallback for iOS, which does not support the Background Sync API. Perhaps a few hundred lines, and no distributed-systems reasoning.

**Sequencing:** (b) this week — it's small and it fixes an active broken promise. Then (d) for expense creation, once the Part A latency work has landed (there's no point queueing writes against a 500 ms server if you can make it 180 ms first). The honest-copy fix from §2 ships with (b) and can be reverted to the stronger promise once (d) lands.

---

#### 4. Service worker approach for Next 16

**Severity: Medium (implementation guidance)**

**Use Serwist, not `next-pwa`.** `next-pwa` is effectively unmaintained and predates the App Router; Serwist (`@serwist/next`) is its actively maintained successor, is TypeScript-native, and supports Next 16 + Turbopack. Hand-rolling is defensible for tier (b) alone — a shell-only SW is genuinely ~40 lines — but the moment you want tier (d)'s outbox and precache manifest, Serwist earns its keep. Given the recommendation is (b) now and (d) next, **start with Serwist so tier (b) isn't thrown away.**

Important interaction to keep in mind: `experimental.useOffline` and a service worker are complementary, not redundant. The SW answers the cold *document* request; `useOffline` handles soft navigations and Server Action retry once the app is running. Keep both.

**Caching strategy per route type:**

| Asset class | Strategy | Why |
|---|---|---|
| `/_next/static/**` (hashed JS/CSS/fonts) | **CacheFirst**, 1 year | Content-hashed, immutable. This is where the 160 KB gzip stops costing anything on repeat launches. |
| `next/font` woff2 | **CacheFirst**, 1 year | Self-hosted and hashed by `next/font`; kills the swap-reflow on repeat launches (Part A §7). |
| Icons, manifest | **StaleWhileRevalidate** | Tiny, rarely change. |
| **Navigation requests (`/`, `/add`, …)** | **NetworkOnly with an offline fallback document** | ⚠️ The critical decision. Do **not** cache HTML with NetworkFirst — every page is dynamic and per-household, and a cached document is one user's private financial data sitting in the HTTP cache. Serve a dedicated `/offline` fallback page instead. |
| `/api/**`, Server Action POSTs | **NetworkOnly** | Never cache authenticated mutations or reads. |
| Supabase `*.supabase.co` | **NetworkOnly** (or don't intercept at all) | Auth tokens; leave to the browser. |

```ts
// next.config.ts
import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

export default withSerwist(withNextIntl(nextConfig));
```

```ts
// src/app/sw.ts
import { defaultCache } from '@serwist/next/worker';
import { Serwist, NetworkOnly, CacheFirst, ExpirationPlugin } from 'serwist';

declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: any };

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,   // hashed static assets + /offline
  skipWaiting: false,                     // see update story below
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ request }) => request.destination === 'font',
      handler: new CacheFirst({
        cacheName: 'fonts',
        plugins: [new ExpirationPlugin({ maxAgeSeconds: 60 * 60 * 24 * 365 })],
      }),
    },
    // Authenticated HTML and APIs: never cached, but fall back to /offline.
    {
      matcher: ({ request }) => request.mode === 'navigate',
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: '/offline', matcher: ({ request }) => request.mode === 'navigate' }],
  },
});

serwist.addEventListeners();
```

`/offline` should be a **statically prerendered** route (no `cookies()`, no Supabase) carrying the wordmark, the theme colours, and an honest message — so the standalone launch lands somewhere that looks like Kapa instead of a browser error. Make sure it does *not* import anything that pulls in `createClient()`, or it will become dynamic and be unprecacheable.

**The update story — do not use `skipWaiting: true`.** A finance app that silently swaps its JS out from under a half-filled expense form is a data-loss vector, and a stale-forever SW is the classic PWA failure. The correct shape is: new SW installs and waits; the app notices and offers the user the swap.

```tsx
// src/components/pwa/UpdatePrompt.tsx
'use client';
import { useEffect, useState } from 'react';

export function UpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let reg: ServiceWorkerRegistration;
    navigator.serviceWorker.register('/sw.js').then((r) => {
      reg = r;
      if (r.waiting) setWaiting(r.waiting);
      r.addEventListener('updatefound', () => {
        const sw = r.installing;
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) setWaiting(sw);
        });
      });
    });
    // Reload once the new SW takes over.
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
    // Catch updates on resume — PWAs are long-lived and rarely reloaded.
    const onVisible = () => document.visibilityState === 'visible' && reg?.update();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  if (!waiting) return null;
  return (
    <button onClick={() => waiting.postMessage({ type: 'SKIP_WAITING' })}>
      A new version is ready — tap to update
    </button>
  );
}
```
The `visibilitychange` → `reg.update()` call matters more than it looks: an installed PWA can go weeks without a hard reload, so without it users genuinely do get stranded on old builds.

---

#### 5. Install experience: iOS users get instructions but no icon path from Safari

**Severity: Medium**

`InstallPrompt.tsx` is **well built** — the `useSyncExternalStore`-based `useIsClient` (`:23-29`) is the correct way to avoid a hydration mismatch when reading `matchMedia`/`localStorage`/`navigator`, the lazy `useState` initialisers (`:40-53`) avoid re-reading storage each render, and the `standalone`/`dismissed` early-returns (`:97`) are right.

The premise is correct that `beforeinstallprompt` is Chromium-only, but the component **already handles that**: `:98` returns null unless `deferred || isIOS`, and `:105` shows `installIOS` copy ("Tap the share icon, then Add to Home Screen") for iOS. So iOS users do get instructions, and only the "Install" button is hidden (`:109`). That is the correct design.

Real gaps:

1. **The prompt only exists on the home page** (`page.tsx:176`). A user who lands on `/login`, signs in, and immediately navigates to `/add` may never see it. Consider mounting it in the layout, or on `/add` after a successful first expense — the moment the app has proven its value is the moment to ask for install.

2. **`dismiss()` is permanent** (`:84`, `localStorage` with no expiry). A user who taps "Not now" on day one is never asked again, ever. Store a timestamp and re-ask after ~30 days.

3. **`isIOS` detection excludes iPadOS 13+**, which reports as `MacIntel` with `navigator.maxTouchPoints > 1`, not `iPad` (`:48`). iPad users get nothing:
```ts
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
```

4. **No iOS splash screens.** `layout.tsx:33-37` sets `appleWebApp: { capable, title, statusBarStyle }` correctly, but there are no `apple-touch-startup-image` links. On iOS, a standalone launch without them shows a **white flash** before first paint — which, combined with §1's cold-launch failure, is currently: white flash → network error page. Even with the service worker in place, add splash images for the common device sizes, or at minimum set `statusBarStyle: 'black-translucent'` and give `<html>` the `background_color` so the flash matches the brand cream (`#f5ead8`) instead of white.

---

#### 6. Manifest and icon audit

**Severity: Low**

Everything declared in `src/app/manifest.ts` **exists on disk at the declared size** — verified:

| Declared | File | Actual | Status |
|---|---|---|---|
| `/icon-192.png` 192×192 any | `public/icon-192.png` | 192×192, 3,517 B | ✅ |
| `/icon-512.png` 512×512 any | `public/icon-512.png` | 512×512, 10,403 B | ✅ |
| `/icon-maskable-512.png` 512×512 maskable | `public/icon-maskable-512.png` | 512×512, 5,293 B | ✅ |
| apple-touch-icon | `src/app/apple-icon.png` | **180×180**, 1,842 B | ✅ correct size, auto-linked by Next |

No broken references, no size mismatches, and `apple-icon.png` is at the canonical 180×180. `start_url: '/'`, `display: 'standalone'`, `theme_color: '#c67139'` (matching `viewport.themeColor` in `layout.tsx:42` — consistent, good), `background_color: '#f5ead8'` all present and correct. The omission of `orientation` is deliberate and documented in the file's docstring, and the reasoning is sound.

Gaps, in rough order of value:

1. **No `shortcuts`.** This is the biggest miss for an app whose entire pitch is "every expense in two taps" — a long-press shortcut straight to `/add` makes it *one* tap from the home screen:
```ts
shortcuts: [
  {
    name: 'Add expense',
    short_name: 'Add',
    url: '/add',
    icons: [{ src: '/icon-192.png', sizes: '192x192' }],
  },
],
```
2. **No `id`.** Without it, browsers derive identity from `start_url`; if `start_url` ever changes, installed instances are treated as a different app. Add `id: '/'` and never change it.
3. **No 192×192 maskable variant.** Only 512 is maskable. Android generally downscales fine, but declaring both is cheap.
4. **No `screenshots`.** Chromium on Android shows a richer, more native-feeling install dialog when `screenshots` with `form_factor: 'narrow'` are present; without them you get the minimal one.
5. **No explicit `scope`.** Defaults to the `start_url` directory (`/`), which is correct here — but stating `scope: '/'` makes it explicit and guards against future changes.
6. **`name` is 47 characters** — "Kapa — one cap, every expense in two taps". `short_name: 'Kapa'` is what appears under the icon so this is harmless, but some install UIs show the full `name` and will truncate it.

---

### What's done well

Genuinely — several things here are better than the review premise assumed, and worth protecting from future refactors:

- **`getClaims()` over `getUser()` in the DAL** (`src/lib/auth/dal.ts:26`) with a docstring explaining the local-verification reasoning. This removes an Auth round-trip from every authenticated render and is the kind of decision that usually gets made backwards.
- **Authorization lives in the DAL, not the proxy or a layout** (`dal.ts:1-8`), which is exactly the Next 16 guidance and exactly the thing most apps get wrong.
- **`cache()` used precisely and for the right reason.** `getHousehold` (`household.ts:19`) collapses three would-be round-trips to one, and the docstring explains the keying. `getHouseholdId` and `verifySession` likewise.
- **`Promise.all` was already there** (`page.tsx:39-44`) and `getSummary` parallelises internally too (`summary.ts:35`). The parallelism review premise assumed missing is present.
- **Zero charting dependency.** `DailySpendChart` is a server component drawing CSS bars (`DailySpendChart.tsx:16`) with a proper `role="img"` label and an `sr-only` data table. Most apps would have shipped 40 KB of Recharts for this.
- **`loading.tsx` skeletons are hand-matched to real layout**, not spinners — `src/app/loading.tsx` mirrors the home page's spacing and card structure, and `PageLoadingShell` renders the *real* back-header so navigation is usable while loading.
- **Client boundaries are at the leaves.** All 12 `'use client'` components are genuinely interactive; no page-level client boundaries, no accidental server-code pull-through.
- **`useSyncExternalStore` for client detection** (`InstallPrompt.tsx:23-29`) instead of a `setState`-in-effect — correct, and correctly explained in the comment.
- **`next/font` used properly** with variable fonts and explicit subsets, plus a genuinely thoughtful comment (`layout.tsx:13-17`) about Cyrillic falling through to `system-ui` per-glyph via `unicode-range`. That is a subtlety most codebases discover as a bug report.
- **The locale-in-a-cookie decision** (`src/i18n/request.ts:5-11`) keeps `getRequestConfig` free of a Supabase call on every single request. Good instinct, correctly documented.
- **`experimental.useOffline` adopted early and used correctly** — the banner is in the root layout exactly as Next's guide prescribes, and Server Action retry is real. The gap is the shell, not the wiring.
- **Icons and manifest are complete and consistent** — every declared asset exists at its declared size, and `theme_color` matches the viewport meta. That is rarer than it should be.
- **The codebase comments explain *why*, repeatedly and accurately.** Several of my initial hypotheses were pre-answered by a docstring. That is a real asset and it made this review faster.
