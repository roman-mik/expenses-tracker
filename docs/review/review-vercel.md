## Vercel & Deployment

**Overall assessment.** The Vercel layer is small, deliberate, and mostly correct: `vercel.json` is minimal and schema-valid, the cron is genuinely hobby-compatible (one daily job) and — unusually for this pattern — is properly authenticated with `CRON_SECRET`, no secret is exposed through a `NEXT_PUBLIC_` var, `.env.local` is untracked and covered by `.gitignore`, and `next.config.ts` does *not* disable type or lint errors during build. The gaps are in the platform hardening layer rather than in correctness: `engines.node` is pinned to an exact patch that Vercel rejects, no security headers exist anywhere, no `regions` is set so functions default to `iad1` regardless of where Supabase lives, CI runs but does not gate the Vercel deploy, and the proxy (middleware) fires a Supabase network round-trip on essentially every request — the one thing on this stack most likely to eat the free-tier function budget.

---

### `engines.node` uses an exact patch version — Vercel rejects this format

**Severity: High**

`package.json:22-24` pins:

```json
"engines": { "node": "24.19.0" }
```

Vercel's build image only accepts *major-version* selectors in `engines.node` (`24.x`, `22.x`, `>=24`). An exact `x.y.z` produces a build-time failure — `Error: Found invalid Node.js Version: "24.19.0"` — or, in more forgiving builder versions, is silently ignored, leaving you on whatever default the project's dashboard setting says. Either way the pin does not do what it looks like it does. `.nvmrc` (`24.19.0`) is *not* read by Vercel at all; it is only consumed by `actions/setup-node` in `.github/workflows/ci.yml:20-22`, so CI and production can silently diverge on Node major.

**Fix** — widen `engines` to the major and keep `.nvmrc` exact for local/CI reproducibility:

```json
"engines": { "node": "24.x" }
```

Then confirm Project Settings → General → Node.js Version in Vercel is set to 24.x so the dashboard doesn't override.

---

### No security headers anywhere (no CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy)

**Severity: High**

`next.config.ts:1-16` defines no `headers()` function, and `vercel.json` (whole file, 6 lines) has no `headers` key. Nothing in `src/proxy.ts` sets response headers either. The result is a session-cookie-bearing app served with only Vercel's defaults: no framing protection, no referrer policy (so the full authed URL leaks in the `Referer` on any outbound link), no HSTS preload signal, and no CSP.

This matters more than usual here because the app is a PWA with an installable manifest and holds financial data behind cookie auth.

**Fix** — add to `next.config.ts` (headers set here apply to all routes including static assets, and survive on Vercel):

```ts
const nextConfig: NextConfig = {
  experimental: { useOffline: true },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};
```

A CSP is the harder half: `next/font/google` self-hosts at build time (no runtime font CDN), but `@vercel/analytics` and `@vercel/speed-insights` (`src/app/layout.tsx:3-4,58-59`) inject scripts from `/_vercel/insights/*` and `/_vercel/speed-insights/*` on the same origin, so a starting point is `default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'`. Ship it `Content-Security-Policy-Report-Only` first, then flip.

---

### CI runs but does not gate the Vercel deploy

**Severity: Medium**

`.github/workflows/ci.yml:3-6` triggers on `push: branches: [main]` and on `pull_request`, running `format:check`, `lint`, `typecheck`, `test`, pgTAP, and `build`. But Vercel's GitHub integration deploys **on push, in parallel with the workflow** — it does not wait for checks. A red CI on `main` still produces a production deploy; the only thing that stops it is `next build` failing inside Vercel itself, which catches type errors but not lint, formatting, unit tests, or the DB tests. README.md ("CI" section) describes the workflow as if it were a gate, which overstates what it does.

**Fix** — pick one:

1. Add an ignored-build-step guard in `vercel.json` so Vercel skips the build unless the commit is green, or
2. Disable Vercel's Git auto-deploy for production (`"git": { "deploymentEnabled": { "main": false } }` in `vercel.json`) and deploy from the workflow with the Vercel CLI as a final step gated on the earlier jobs, or
3. At minimum, enable branch protection on `main` requiring the `ci` check, so nothing red lands there in the first place.

Option 3 is the cheapest and fits a solo hobby project.

---

### Proxy runs a Supabase network round-trip on nearly every request

**Severity: Medium**

`src/proxy.ts:31` calls `await supabase.auth.getUser()` on every matched request, and the matcher (`src/proxy.ts:36-39`) excludes only `_next/static`, `_next/image`, `favicon.ico`, `manifest.webmanifest`, and image extensions. Everything else — every page nav, every `/api/*` call, every Server Function POST — pays a full HTTP round-trip to Supabase's auth server *before* the route handler runs, and then the handler calls `verifySession()` again (`src/lib/api/http.ts:65`), which is a second `getUser()`. So a single `GET /api/summary` costs two auth round-trips plus the data query.

In Next 16 the proxy defaults to the **Node.js runtime** and the `runtime` config option is unavailable there (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:223`), so on Vercel this is a full function invocation per request, not a cheap edge hop. On Hobby that is the single largest driver of function-invocation and GB-hours consumption in this app, and it adds Supabase-round-trip latency to every request.

**Fix** — narrow the matcher so the proxy only runs where a *cookie refresh* is actually needed, i.e. document navigations, not API calls that authenticate themselves:

```ts
export const config = {
  matcher: [
    '/((?!api|auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

`/api/*` routes already enforce auth via `requireHousehold()` → `verifySession()` and RLS, so excluding them removes a redundant round-trip without weakening anything. Note the caveat at `proxy.md:217-219`: Server Functions are POSTs to the *page* route, so they stay covered by the pattern above — only `/api` and `/auth` are dropped, and both authenticate independently (`src/app/auth/callback/route.ts:25` exchanges the code itself).

---

### No `regions` set — functions default to `iad1` regardless of Supabase region

**Severity: Medium**

`vercel.json` sets no `regions` key. Vercel Hobby deploys all functions to a single region, defaulting to `iad1` (Washington DC). Every page render in this app is dynamic (cookie-backed Supabase client, `src/lib/supabase/server.ts:10`) and issues multiple sequential queries — `src/app/page.tsx:30-…` alone fans out to `getSummary`, `listExpenses`, `getCategories`, `getHousehold`, `getHouseholdMembers`. If the Supabase project is in an EU region (the €-denominated cost notes in `PLAN.md:271` suggest a EU-based owner), each of those queries crosses the Atlantic, and the round-trips compound into hundreds of milliseconds of TTFB.

**Fix** — pin the function region to the Supabase region. For a EU-Central Supabase project:

```json
{
  "regions": ["fra1"],
  "crons": [{ "path": "/api/keepalive", "schedule": "0 6 * * *" }]
}
```

Hobby allows exactly one region, so verify the Supabase project's region first (Supabase → Project Settings → General → Region) and match it. This is the highest-leverage single-line perf change available on this stack.

---

### Env vars accessed with non-null assertions; the "env checks" CI comments describe validation that doesn't exist

**Severity: Medium**

`src/lib/supabase/server.ts:13-14` and `src/lib/supabase/client.ts:6-7` both do:

```ts
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
```

There is no boot-time validation anywhere — a grep for `process.env.` across `src/` returns only these four sites plus `CRON_SECRET`. A missing or typo'd env var in the Vercel project therefore produces no build error and no startup error; it surfaces as an opaque runtime failure inside `@supabase/ssr` on the first authed request, on the deployed site. `src/proxy.ts:7-11` is the one place that handles absence gracefully (it skips session refresh), which creates an inconsistent story: the proxy degrades quietly while the server client explodes.

Compounding this, `.github/workflows/ci.yml:12-13` comments that dummy values are needed "to satisfy the env checks in `src/lib/supabase/*`" — those checks do not exist. The comment will mislead whoever next tries to change the CI env.

**Fix** — add a small validated env module imported by both clients (zod is already a dependency):

```ts
// src/lib/env.ts
import { z } from 'zod';

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export const env = schema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});
```

Importing this from a module that runs during `next build` turns a misconfigured Vercel project into a failed build instead of a broken production site — and then the CI comment becomes accurate. Also fix the comment either way.

---

### Preview deployments will fail auth unless Supabase redirect URLs include a wildcard

**Severity: Medium**

`src/app/auth/callback/route.ts:16,21,27,30` builds every redirect from `request.nextUrl.origin`, so the callback itself adapts correctly to a preview URL. The failure is upstream: Supabase Auth only honors a `redirectTo` whose origin appears in its **Redirect URLs** allow list, and Vercel preview deployments get a fresh, unpredictable hostname per commit (`tracker-<hash>-<scope>.vercel.app`). Unless a wildcard is registered, magic-link and OAuth sign-in are broken on every preview deploy — meaning PRs can never be auth-tested before merge, which pairs badly with the ungated-deploy finding above.

**Fix** — in Supabase → Authentication → URL Configuration, add `https://*-<your-scope>.vercel.app/**` to Redirect URLs alongside the production URL and `http://localhost:3000/**`. Prefer the scoped wildcard over a bare `https://*.vercel.app/**`, which would let any Vercel-hosted site receive your auth codes. Document this in README.md's Deploy section — it is currently absent, and it's the kind of thing that costs an hour to rediscover.

---

### `next` redirect param in the auth callback is unvalidated

**Severity: Low**

`src/app/auth/callback/route.ts:18,30`:

```ts
const next = searchParams.get('next') ?? '/';
const response = NextResponse.redirect(`${origin}${next}`);
```

Concatenating onto `origin` and letting the WHATWG URL parser handle the result blocks the obvious attacks — `next=//evil.com` parses to host `origin` with path `//evil.com`, and `next=https://evil.com` yields an unparseable URL that throws. So this is not currently an exploitable open redirect. But the safety is incidental, a property of URL parsing rather than of the code, and it would break the moment someone refactors to `new URL(next, origin)` (which *does* honor a protocol-relative `next`) or passes `next` to any other sink. A thrown `TypeError` on the malformed case is also a 500 rather than a graceful bounce to `/login`.

**Fix** — validate explicitly, so the guarantee is stated rather than inherited:

```ts
const raw = searchParams.get('next') ?? '/';
const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
```

---

### `.env.local.example` omits `CRON_SECRET`

**Severity: Low**

`.env.local.example` lists only the two `NEXT_PUBLIC_SUPABASE_*` vars, but `src/app/api/keepalive/route.ts:11` requires `CRON_SECRET`, and README.md's env table documents it as a third required var. The example file is the thing people actually copy (`cp .env.local.example .env.local` — README.md, Local development), so the omission means a fresh clone silently ships a keepalive route that 401s. The route's own comment ("set automatically by Vercel when the env var exists") is right about production but doesn't help anyone locally.

**Fix** — append to `.env.local.example`:

```
# Cron auth — any random string; set the same value in Vercel → Environment Variables.
# Vercel sends it as `Authorization: Bearer $CRON_SECRET` on scheduled invocations.
CRON_SECRET=
```

Keeping the example file exhaustive also makes it the single source of truth to diff against the Vercel dashboard.

---

### Authed JSON responses carry no explicit `Cache-Control`

**Severity: Low**

`src/lib/api/http.ts:16-18` returns bare `NextResponse.json(data, init)` with no cache directives, and no route handler sets any (`grep` for `Cache-Control` across `src/` returns nothing). In practice Next 16 treats these handlers as dynamic and Vercel's CDN will not cache a response on a cookie-bearing request, so nothing is leaking today. But every one of these payloads is per-household financial data, and the correct posture for that is stated rather than assumed — a future `export const revalidate` or a shared-cache misconfiguration should not be the thing standing between two households' data.

**Fix** — set the header centrally in the `json` helper:

```ts
export function json<T>(data: T, init?: ResponseInit): NextResponse {
  const res = NextResponse.json(data, init);
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
}
```

---

### No error reporting or log drain; `console.error` is the entire observability story

**Severity: Low**

Server-side failures are handled consistently but terminate at `console.error` — `src/app/api/keepalive/route.ts:20`, `src/app/api/summary/route.ts:23`, `src/lib/api/http.ts:74`, and the same pattern across the other route handlers. On Vercel Hobby, runtime logs are retained for roughly an hour and log drains are a Pro feature, so in practice a production error is unobservable unless someone happens to have the dashboard open. `src/app/error.tsx` and `src/app/global-error.tsx` exist but (per the grep above) don't report anywhere either.

Most relevant: the keepalive cron is the one thing that must not fail silently, because its failure mode is invisible for ~7 days and then the Supabase project pauses. A 500 from `/api/keepalive` currently goes nowhere.

**Fix** — a free Sentry account wired into `error.tsx` / `global-error.tsx` and the route handlers is the complete answer. If that's more than this project wants, a cheap alternative for the cron specifically: have `/api/keepalive` ping a free healthcheck service (healthchecks.io, Better Stack) on success, so *absence* of the ping alerts you rather than presence of a log line.

---

### Free-tier headroom is fine; the proxy is the only real exposure

**Severity: Nit**

For completeness, the things that usually blow up a Hobby project are all clean here:

- **Image optimization** — zero usage. No `next/image` import anywhere in `src/`, no `images` config in `next.config.ts`, and `public/` holds only six hand-made PWA icons (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, plus SVGs), all served as plain static assets. The image-optimization transform quota is untouched.
- **Fonts** — `next/font/google` (`src/app/layout.tsx:11-26`) self-hosts at build time; no runtime font fetches, no third-party CDN.
- **Bandwidth** — a text-only PWA with no media; 100 GB/mo is not a realistic constraint.
- **Cron quota** — one daily job, well inside Hobby's limit (see below).

The one number worth watching is function invocations, driven almost entirely by the proxy matcher discussed above. Narrowing that matcher is the whole mitigation.

One non-technical note already captured at `PLAN.md:270`: Vercel Hobby is **non-commercial use only**. If Kapa ever takes payment or is used by a business, the plan must move to Pro before that happens — worth re-reading when the project's status changes.

---

## What's done well

- **The cron is properly authenticated.** `src/app/api/keepalive/route.ts:11-15` verifies `Authorization: Bearer ${CRON_SECRET}` and fails closed when the secret is unset (`!secret ||` — so a missing env var 401s rather than accidentally allowing everyone). This is the single most commonly botched thing about Vercel crons, and it's right, including the fail-closed direction.
- **The cron schedule is genuinely Hobby-compatible.** `vercel.json` declares exactly one job at `0 6 * * *` — daily, which is what Hobby supports. No sub-daily schedule that would silently not fire.
- **`vercel.json` is minimal and entirely schema-valid.** Just `crons`, with correct `path`/`schedule` keys. No stale `builds`, `version`, or `routes` keys carried over from older Vercel schemas.
- **No secret is exposed to the client.** Only the publishable (anon) key and project URL carry `NEXT_PUBLIC_` (`src/lib/supabase/client.ts:6-7`); `CRON_SECRET` is server-only and read exclusively inside a route handler. No service-role key anywhere in the repo. `NEXT_PUBLIC_` discipline is clean.
- **Secrets are not in git.** `.gitignore` uses the `.env*` + `!.env.local.example` pattern, and `git ls-files | grep env` returns only `.env.local.example` — confirmed clean, not just configured clean.
- **`next.config.ts` does not disable type or lint errors during build.** No `typescript.ignoreBuildErrors`, no `eslint.ignoreDuringBuilds`. The Vercel build is a real gate on type correctness.
- **CI is thorough where it runs.** `.github/workflows/ci.yml` covers formatting, lint, typecheck, unit tests, a real Supabase instance with pgTAP DB tests, and a production build — noticeably more than most projects this size. The gap is that it doesn't gate the deploy, not that it's weak.
- **Analytics wiring is correct.** `<Analytics />` and `<SpeedInsights />` are imported from the `/next` entrypoints and placed at the end of `<body>` in the root layout (`src/app/layout.tsx:3-4,58-59`) — exactly the documented placement.
- **The proxy matcher already excludes static assets and the image optimizer**, which is the correctness half of the matcher problem (assets never get blocked by auth logic); only the cost half is left.
- **`src/lib/supabase/server.ts:6-10` deliberately lets `DynamicServerError` propagate**, with a comment explaining that swallowing it would force `dynamic = 'force-dynamic'` on every authed page. That's a genuinely well-understood Next-on-Vercel rendering subtlety, documented at the point of decision.
