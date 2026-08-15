## Next.js Conventions

**Overall assessment.** This app runs **Next.js 16.3.0** (`package.json:26`), and every judgement below was verified against the *bundled, version-matched* docs in `node_modules/next/dist/docs/`, not against Next 14/15 habits. The verdict is unusually good: this is one of the cleaner Next 16 App Router codebases I've reviewed. All the Next 16 breaking changes are already handled correctly — `middleware.ts` has been migrated to `src/proxy.ts` with a named `proxy` export, every `params`/`searchParams`/`cookies()`/`headers()` access is awaited, `error.tsx` already uses the 16.3-stable `retry` prop (not the legacy `reset`), there is no `experimental_ppr`, no `experimental.dynamicIO`/`useCache`, no `next lint`, no `serverRuntimeConfig`, no `images.domains`, and no bare single-argument `revalidateTag`. Auth is done the way the Next 16 docs actually prescribe — a `cache()`-wrapped DAL re-verified inside every Server Action and route handler, with `proxy.ts` doing *only* optimistic session refresh. **No deprecated or removed Next.js API is in use anywhere in the repo.**

The findings that remain are one genuine runtime bug in a route handler, a few performance/architecture items (a per-request network round-trip in the proxy, an un-narrowed proxy matcher, redundant double-revalidation), and a handful of typing/idiom nits where Next 16's generated helpers would be a strict improvement.

---

### `json(null, { status: 204 })` throws at runtime — `GET /api/cap` returns 500 instead of 204

**Severity: High**

`src/app/api/cap/route.ts:12` returns `json(null, { status: 204 })` when no cap row exists. `json()` (`src/lib/api/http.ts:16`) is `NextResponse.json`, which always writes a body. The Fetch spec forbids a body on a null-body status, so the `Response` constructor throws:

```
$ node -e "Response.json(null,{status:204})"
TypeError: Response constructor: Invalid response status code 204
```

The throw escapes the `try` (it is on the `return` inside the `try`, so it is caught by the surrounding `catch` on line 14) and the endpoint answers **500 with `{"error":"Failed to get the monthly cap"}`** on the exact happy path it was meant to handle: a brand-new household that has not set a cap yet. The repo already knows about this — `src/app/api/cap/route.test.ts:46-51` explicitly asserts the 500 and comments that it "documents an existing bug, not desired behavior… left as discovered-but-out-of-scope."

Docs: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` — route handlers use the Web `Response`/`NextResponse` API, so Web `Response` status semantics apply verbatim.

**Fix** — return a bodyless response, and update the test to assert the intended behavior:

```ts
// src/app/api/cap/route.ts
if (!cap) return new NextResponse(null, { status: 204 });
```

(Or, if a JSON-shaped answer is preferable for the client, `return json(null)` at 200 and let the caller check for `null`. Either is fine; the current pair is not.)

---

### `proxy.ts` makes a network round-trip to Supabase Auth on every single request

**Severity: Medium**

`src/proxy.ts:31` calls `await supabase.auth.getUser()`, which is a network call to the Supabase Auth server. Because of the matcher (see next finding) this runs on every page navigation, every prefetch, every `/api/*` call, and every Server Action POST — adding a full auth round-trip in front of the request before any rendering starts.

The codebase already knows the cheaper primitive: `src/lib/auth/dal.ts:24-30` deliberately uses `getClaims()` because it "verifies the token's signature *locally* (no round-trip to the Supabase Auth server), which is the hot path on every authed navigation." The proxy contradicts its own DAL on the hotter path.

Docs: `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md:29` — "Proxy is *not* intended for slow data fetching… it should not be used as a full session management or authorization solution." `proxy.md:19` adds that Proxy "is meant to be invoked separately of your render code and in optimized cases deployed to your CDN."

**Fix**: use the same local-verification call the DAL uses, so the proxy still triggers `@supabase/ssr`'s cookie-refresh `setAll` without the auth-server hop:

```ts
// src/proxy.ts:31
await supabase.auth.getClaims();
```

Verify against your Supabase project's signing-key type — with asymmetric keys `getClaims()` is fully local; with legacy HS256 it internally falls back to a network call, i.e. no worse than today.

---

### Proxy matcher does not exclude `/api` — session refresh runs twice per API call

**Severity: Medium**

`src/proxy.ts:36-39` matches everything except static assets:

```
'/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
```

`/api/*` is not excluded, so every route handler pays the proxy's auth call (finding above) *and then* pays `requireHousehold()` → `verifySession()` again inside the handler (`src/lib/api/http.ts:65`). `/api/keepalive` — a Vercel cron endpoint authenticated by `CRON_SECRET`, with no user session at all (`src/app/api/keepalive/route.ts:10-14`) — still runs the whole Supabase session-refresh dance for nothing, once a day but pointlessly.

Docs: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:604-619` gives the canonical negative-lookahead matcher and it *does* exclude `api` by name.

**Important caveat before changing this**: the same doc, at `proxy.md:217-219`, warns that Server Functions are POSTs to the route they are used on, so "a Proxy matcher that excludes a path will also skip Proxy coverage" for them. Excluding `/api` is safe here (Server Actions live at page routes, not under `/api`), and authorization is correctly re-done in every action and handler anyway — so this is a pure win.

**Fix**:

```ts
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

---

### Every mutation revalidates twice: `revalidatePath` on the server plus `router.refresh()` on the client

**Severity: Medium**

Each Server Action ends with `revalidatePath(...)` — e.g. `src/app/actions/expenses.ts:37`, `:72-73`, `:93-94`; `src/app/actions/categories.ts:37-39`; `src/app/actions/cap.ts:32`. Then the calling Client Component *also* calls `router.refresh()` on success: `src/components/home/HistoryList.tsx:105`, `src/components/categories/CategoryManager.tsx:87,104,119,270`, `src/components/settings/DisplayNameForm.tsx:28`, `src/components/settings/LocaleForm.tsx:30`, `src/components/household/HouseholdPanel.tsx:36,75`. That is two server round-trips per mutation.

Next 16 introduced a first-class API for exactly this. Docs: `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md:516-548` documents `refresh()` from `next/cache`, which "allows you to refresh the client router from within a Server Action" — folding the client refresh into the action's own response.

**Fix**: keep `revalidatePath` for the server cache, and replace the client-side `router.refresh()` calls by adding `refresh()` from `next/cache` at the end of each action:

```ts
import { revalidatePath, refresh } from 'next/cache';
// …
revalidatePath('/');
revalidatePath('/history');
refresh();
```

Then drop `router.refresh()` (and the now-unused `useRouter` import) from the listed components. Note `AddExpenseForm` uses `router.push()`, not `refresh()` — leave that one alone.

---

### Pages and route handlers hand-roll `Promise<…>` prop types instead of the generated `PageProps` / `RouteContext` helpers

**Severity: Low**

`src/app/layout.tsx:45` correctly uses the generated `LayoutProps<'/'>`, and `package.json:11` already runs `next typegen` in the `typecheck` script — so the helpers are available. But every other file hand-writes them:

- `src/app/edit/[id]/page.tsx:13-17` — `{ params: Promise<{ id: string }> }`
- `src/app/history/page.tsx:16-20` — `{ searchParams: Promise<{ category?: string }> }`
- `src/app/login/page.tsx:4-8` — `{ searchParams: Promise<{ error?: string }> }`
- `src/app/api/expenses/[id]/route.ts:5-8` and `:42-45`, `src/app/api/categories/[id]/route.ts:5-8` — `{ params: Promise<{ id: string }> }`

These are all *correct* (the awaits on `page.tsx:24`, `history/page.tsx:46`, `login/page.tsx:10`, `route.ts:11`/`:48` satisfy the Next 16 async-request-API requirement). They are just unverified against the actual route tree, so a renamed segment silently rots the type.

Docs: `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md:295-315` — "run `npx next typegen` to automatically generate these globally available type helpers: `PageProps`, `LayoutProps`, `RouteContext`," with the `PageProps<'/blog/[slug]'>` example.

**Fix**:

```tsx
// src/app/edit/[id]/page.tsx
export default async function EditExpensePage({ params }: PageProps<'/edit/[id]'>) {

// src/app/history/page.tsx
export default async function HistoryPage({ searchParams }: PageProps<'/history'>) {

// src/app/api/expenses/[id]/route.ts
export async function PATCH(request: Request, ctx: RouteContext<'/api/expenses/[id]'>) {
  const { id } = await ctx.params;
```

---

### `global-error.tsx` uses `reset` where the docs now prefer `retry`

**Severity: Low**

`src/app/error.tsx:13,38` correctly uses the `retry` prop — good, that is the current 16.3 convention. But `src/app/global-error.tsx:11,53` still takes `reset` and calls `reset()`.

Docs: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md:155-157` — "In most cases, you should use `retry()` instead. However, if you have a specific reason to clear the error state and re-render the error boundary's children *without re-fetching* the contents, you can use `reset()`." The same file's `GlobalError` example (`error.md:194-200`) uses `retry`, and the version table (`error.md:331-332`) records `retry` as stable in `v16.3.0` — the exact version pinned here. `reset` is not deprecated, but for a global crash you want a re-fetch, not a bare re-render, so `retry` is the right prop.

**Fix**: rename the prop and the call in `src/app/global-error.tsx` to `retry`, matching `error.tsx`.

---

### The full message bundle is serialized to the client on every page

**Severity: Low**

`src/i18n/request.ts:32` loads the entire locale file, and `src/app/layout.tsx:54` mounts `<NextIntlClientProvider>` with no `messages` prop, which inherits *all* messages from server context. Every page therefore ships the whole bundle (`messages/en.json` 7.6 KB, `messages/ru.json` 11.2 KB) in the RSC payload, including namespaces that page never reads — a page like `/settings` carries the `Home`, `Add`, `History`, and `Household` namespaces for nothing.

This is a next-intl integration choice, not a Next.js rule violation, and the rest of the next-intl wiring is correct for App Router in this version: the plugin is registered at `next.config.ts:4`, `getRequestConfig` awaits `cookies()`/`headers()` properly (`src/i18n/request.ts:15,19`), Server Components use `getTranslations` from `next-intl/server` and Client Components use `useTranslations`, and there is no `[locale]` segment by deliberate design (documented in `src/i18n/routing.ts:1-6`).

**Fix** (only if payload matters at this size — 8-11 KB gzipped is small): pass a narrowed set per subtree, e.g. `<NextIntlClientProvider messages={pick(messages, ['Common', 'Nav'])}>` in the layout and provide page-specific namespaces closer to the client components that need them.

---

### No per-page metadata; only the root layout defines any

**Severity: Nit**

`src/app/layout.tsx:28-43` correctly splits `generateMetadata()` (title/description/`appleWebApp`) from the separate `export const viewport: Viewport` — that split is exactly right for Next 16. But no `page.tsx` exports its own `metadata`/`generateMetadata`, so `/history`, `/settings`, `/cap` etc. all share the root title in the browser tab and in shares.

Docs: `node_modules/next/dist/docs/01-app/01-getting-started/14-metadata-and-og-images.md` and `03-api-reference/04-functions/generate-metadata.md` — metadata is merged down the segment tree, and pages are expected to contribute their own `title`.

Icons are handled well: `src/app/favicon.ico` and `src/app/apple-icon.png` are file-convention-detected per `03-file-conventions/01-metadata/app-icons.md`, and `src/app/manifest.ts` is a correct `MetadataRoute.Manifest` with `any` + `maskable` purposes per `01-metadata/manifest.md`.

**Fix**: add a small `export const metadata = { title: '…' }` (or `generateMetadata` where the title needs translating) to each page.

---

### No `<Suspense>` boundaries — `loading.tsx` blocks the whole page on the slowest query

**Severity: Nit**

There is not a single `Suspense` in `src/`. Each route has a route-level `loading.tsx` (`src/app/loading.tsx`, `add/`, `cap/`, `categories/`, `edit/[id]/`, `history/`, `household/`, `settings/`), which is good and gives instant navigation — but it means the entire page waits on the slowest of its parallel queries before *anything* renders.

The data fetching itself is already correct: `src/app/page.tsx:39-44` batches four Supabase reads with `Promise.all`, and `add/`, `cap/`, `edit/[id]/`, `history/`, `household/` all do the same. There are no N+1 loops and no accidental waterfalls other than the necessary `getHousehold` → `currentMonth` dependency. So the only remaining win is streaming.

Docs: `node_modules/next/dist/docs/01-app/02-guides/streaming.md` and `01-getting-started/06-fetching-data.md` — wrap slower independent subtrees in `<Suspense>` so the fast shell paints first.

**Fix** (optional, and only worth it if a query is measurably slow): on `src/app/page.tsx`, extract `DailySpendChart`'s `days` computation and `TodayList` into async child components and wrap each in `<Suspense fallback={…}>`, letting the cap/remaining card paint before the expense list resolves.

---

## What's done well

- **Next 16 migration is complete and correct.** `middleware.ts` → `src/proxy.ts` with a named `export async function proxy` (`proxy.md:58`); no `experimental_ppr`, no `experimental.dynamicIO`/`useCache`, no `next lint`, no `serverRuntimeConfig`, no `images.domains`, no `next/legacy/image`, no single-arg `revalidateTag`. **Zero deprecated or removed Next.js APIs in the repo.**
- **Async Request APIs everywhere.** Every `params`, `searchParams`, `cookies()`, and `headers()` is awaited — `edit/[id]/page.tsx:24`, `history/page.tsx:46`, `login/page.tsx:10`, `api/expenses/[id]/route.ts:11,48`, `api/categories/[id]/route.ts:11`, `lib/supabase/server.ts:10`, `i18n/request.ts:15,19`, `actions/profile.ts:61,87`.
- **Authorization is done the way the docs demand, not the way middleware tempts you to.** `src/lib/auth/dal.ts:1-8` states the rule explicitly, and every Server Action (`actions/expenses.ts:22`, `actions/categories.ts:22`, `actions/cap.ts:17`, `actions/profile.ts:21,50`) and every route handler (`lib/api/http.ts:65`) re-verifies the session independently. This is precisely what `proxy.md:217-219` and `data-security.md:609` require, and it means the matcher fix above carries no security risk.
- **`cache()`-wrapped DAL.** `verifySession` and `getHouseholdId` (`dal.ts:24,42`) are React-`cache`d, so the repeated `verifySession()` calls across a page render collapse to one Supabase read.
- **`cookies()` is allowed to throw.** `src/lib/supabase/server.ts:6-9` documents *why* there is no outer try/catch — swallowing `DynamicServerError` would break Next's dynamic-rendering detection and force `dynamic = 'force-dynamic'` everywhere. That is a subtle, correct, and well-reasoned call.
- **Server/Client boundary is drawn low and tight.** Only 12 leaf components carry `'use client'`; every `page.tsx` is a Server Component. No server-only secret crosses the line — only `NEXT_PUBLIC_*` values appear in `lib/supabase/client.ts`, and `CRON_SECRET` is read exclusively server-side (`api/keepalive/route.ts:11`). `CategoryFilter` is a *server* component using plain `<Link>` (`components/history/CategoryFilter.tsx:1-5`), which is the right instinct.
- **`error.tsx` uses the 16.3-stable `retry` prop** (`error.tsx:13`) — genuinely current, not a Next 15 habit. Both boundaries are correctly `'use client'`, and `global-error.tsx:22-23` correctly renders its own `<html>`/`<body>`.
- **`next.config.ts` is clean and current.** `experimental.useOffline` is in the right place per `05-config/01-next-config-js/useOffline.md` (still experimental in 16.3), and `next/offline`'s `useOffline()` hook is consumed correctly in `OfflineBanner.tsx:3,14`. No stale `experimental.turbopack`, no orphaned `eslint` key.
- **`next/font` is used properly** — `Figtree` and `Caprasimo` via `next/font/google` with CSS variables (`layout.tsx:11-26`), and the comment at `:13-17` shows real understanding of the Cyrillic `unicode-range` fallback. `next/image` is legitimately absent: the app ships no content images.
- **Progressive enhancement where it counts.** Sign-out is a real `<form action="/auth/signout" method="post">` (`settings/page.tsx:29`) hitting a route handler that returns a proper 303 (`auth/signout/route.ts:7-9`), and the history category filter is server-rendered links.
- **Route handler HTTP hygiene** is otherwise solid: 201 on create (`api/categories/route.ts:32`, `api/expenses/route.ts:47`, `api/household/invite/route.ts:11`), 401/400/404 via shared helpers, raw Postgres errors never leaked to clients (`lib/api/http.ts:51-57`), and `NextRequest` used only where `nextUrl` is actually needed.
- **ESLint flat config** (`eslint.config.mjs`) matches the Next 16 default, with `globalIgnores` used to *extend* rather than fight the preset — and no rule is disabled or worked around anywhere in `src/`. No `eslint-disable` comments exist in the codebase.
