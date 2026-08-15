## Security

### Overall assessment

The application layer is, on its own terms, unusually disciplined: every Route Handler and every Server Action independently re-verifies the session through the DAL (`requireHousehold` / `verifySession`), never trusts `proxy.ts`, builds every UPDATE patch from an explicit column whitelist, scopes every query by `household_id` in addition to RLS, and returns generic error strings to clients while logging details server-side. There is no mass-assignment hole, no IDOR reachable through the app's own endpoints, and no unauthenticated route besides `/login` and the `CRON_SECRET`-gated keepalive.

The problem is that **the application layer is not the trust boundary**, and the code is written as though it were. The browser holds the publishable anon key (`src/lib/supabase/client.ts:6-7`) and a user JWT in a non-`httpOnly` cookie, so any authenticated user can bypass every Next.js handler and speak PostgREST directly at `https://<project>.supabase.co/rest/v1/...`. Everything the app carefully refuses to do — patching `user_id`, patching `currency`, calling `join_household` a million times — is one `curl` away. That makes the two DB-side gaps other reviewers found (`expenses_update` missing the `user_id` check, `allowed_emails` with no RLS) directly reachable, and it makes "add rate limiting to `/api/household/join`" a non-fix: the attacker will not use that endpoint.

The realistic worst case, in order of concern: (1) if `allowed_emails` is reachable by the `anon` role **and** Supabase's signup toggle is ON in production, an unauthenticated stranger can self-provision an account with two HTTP requests, at which point the invite-code keyspace and the RLS gaps are theirs to work on; (2) invite codes are permanent, unlimited-use bearer tokens to a stranger's complete financial history plus write access, with a guessing oracle that has no throttle anywhere; (3) auth cookies are readable by JavaScript, so any future XSS is not a session bug but a full, portable account takeover. CSRF, by contrast, is a non-issue in practice here and I would not spend time on it.

### Threat model

**Assets.** Household expense history (amounts, notes, timestamps, per-member attribution) — low-value to the world, high-value to the two people in it; the monthly cap; user email addresses (in `auth.users` and in `allowed_emails`); active invite codes, which are capability tokens; the auth session itself.

**Actors.** (a) Unauthenticated internet — has the app URL, the Supabase project URL, and the publishable anon key, all trivially extracted from the client bundle. (b) Authenticated outsider — anyone who got an account, whether legitimately invited, provisioned via an `allowed_emails` bypass, or handed a leaked invite code. Within a household this actor is fully trusted by design (shared pool: any member may edit or delete any expense), so the boundary that matters is *between* households. (c) Malicious co-member — an insider who wants to falsify attribution or destroy history. (d) A web page the victim visits — relevant only for CSRF/clickjacking. (e) Anyone with read access to Vercel logs.

**Trust boundaries.** The real one is Postgres RLS, evaluated on the JWT's `sub`. The Next.js server is a *second* enforcement point but not a *sufficient* one, because the same JWT works directly against PostgREST — so any control that exists only in `src/` is advisory. Inside a household there is effectively no boundary at all. The `auth.users` insert trigger is the registration boundary. `CRON_SECRET` is the boundary for `/api/keepalive`.

---

### Anon-key access to `allowed_emails` is a potential unauthenticated registration bypass

**Status: fixed** — `supabase/migrations/0005_lock_allowlist.sql` enables RLS with no policies and revokes all privileges from `anon`/`authenticated`. Verified locally that the anon-key curl below now returns `42501`. Production still needs the same curl run against it, and the dashboard signup toggle turned off.

**Severity:** Critical (if preconditions hold) · **Exploitability:** Conditional — hinges on two production settings that are not in the repo

**Evidence.** `supabase/migrations/0002_optional_allowlist.sql:16-18` creates `public.allowed_emails` with no `enable row level security`. No migration issues any `grant` or `revoke` (verified across all four files). `supabase/config.toml:13` exposes the `public` schema to the Data API; `config.toml:24` leaves `auto_expose_new_tables` commented out, so whether `anon` holds `SELECT`/`INSERT` on this table depends entirely on when the cloud project was created and what its default privileges are. `config.toml:176` and `:221` both set `enable_signup = true`, and `0002:3-6` states plainly that the *primary* gate is the dashboard toggle, with the allowlist as backstop — i.e. by design these two controls are meant to be redundant, and this finding is what happens when the redundancy inverts into a single point of failure.

**Exploit scenario.** Preconditions: `anon` has been granted table privileges on `public.allowed_emails` (the legacy Supabase default, and the same default that must be in force for the rest of this app to work at all — note that `expenses`, `profiles` etc. *are* reachable by `anon`+JWT today, which is evidence that broad grants exist in this project), and the dashboard signup toggle is ON.

1. Attacker loads the app, reads `NEXT_PUBLIC_SUPABASE_URL` and the publishable key out of the JS bundle — both are shipped to every visitor by design.
2. `GET /rest/v1/allowed_emails?select=email` with `apikey: <anon>` → the complete list of invited email addresses. That is a small, targeted PII disclosure on its own (it tells you exactly who uses this app).
3. `POST /rest/v1/allowed_emails` with `{"email":"attacker@evil.tld"}` → row inserted, no RLS to stop it.
4. `POST /auth/v1/signup` with that email and any 6-character password. The `before_auth_user_insert` trigger (`0002:36-39`) now finds the row and permits the insert.
5. `handle_new_user` seeds a profile, a household-of-one, membership, cap and default categories — so this is a *fully working* account, not an orphan profile. The attacker is now actor (b) and can reach every finding below.

Note step 2 is independently useful even if inserts are blocked but selects are not.

**Fix.** Do all three; they are cheap and independent.

```sql
-- migration 0005: lock down the allowlist
alter table public.allowed_emails enable row level security;
-- No policies at all: the SECURITY DEFINER trigger bypasses RLS, everyone else sees nothing.
revoke all on public.allowed_emails from anon, authenticated;
```

Then verify the production posture rather than assuming it — this takes 30 seconds:

```bash
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/allowed_emails?select=email" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
# want: {"code":"42501", ...} or an empty array — NOT a list of emails
```

And set Authentication → "Allow new users to sign up" = OFF in the dashboard, so the allowlist is genuinely a backstop rather than the only gate.

---

### Invite codes are permanent, unlimited-use bearer tokens with an unthrottled guessing oracle

**Severity:** High · **Exploitability:** Practical for leaked codes; Conditional for brute force

**Evidence.** `src/lib/mutations/household.ts:10-12` — `randomBytes(4).toString('hex').toUpperCase()`, i.e. 8 uppercase hex characters, keyspace 16^8 = 4.29e9 (32 bits). `supabase/migrations/0003_households.sql:22` — `expires_at` nullable with "null = no expiry (v1)", and nothing in `createInvite` ever sets it. `join_household` (`0003:290+`) matches on `code = invite_code` with only the expiry check and never deletes or marks the code used, so one code admits unlimited joiners forever. `src/app/api/household/join/route.ts` applies no throttle, and neither does anything else in `src/`.

**Impact of a single successful join.** `join_household` moves the joiner's `household_members` row into the target household. From that moment RLS's `is_household_member(household_id)` returns true for them, granting `select`/`update`/`delete` on every expense in the household's entire history, plus the cap, plus categories, plus co-members' `profiles` rows. Full read of a stranger's financial history and unrestricted write access — including the ability to delete all of it. The RPC also silently drops the joiner's own household if it is left empty (`0003:~382`), so a mistaken join is destructive to the joiner too.

**Exploit scenario A — leaked code (Practical).** A code is shared over WhatsApp, appears in a screenshot, or sits in a browser history/URL. Six months later it still works, and it works for an unlimited number of people. Nobody in the household is notified, and there is no way to see that an extra member joined except by opening the Household screen. Preconditions: attacker has an account (see previous finding, or is an ex-partner who already had one). Steps: one authenticated `POST` with the code. Impact: as above.

**Exploit scenario B — brute force (Conditional).** The attacker does *not* use `/api/household/join`; they call `POST /rest/v1/rpc/join_household` directly with their own JWT, so any Next.js-side limiter is irrelevant. With `H` active codes in the system, expected guesses to first hit ≈ 2^32/(2H). For a two-user hobby deployment with one active code, ~2.1e9 expected requests: at 100 req/s that is ~8 months, at a distributed 5,000 req/s about 5 days. So a single-household instance is protected mostly by *obscurity of scale*, not by the code length — and the protection degrades linearly as the app grows, while Supabase's free-tier compute would likely fall over (a denial-of-service in its own right) before the attacker succeeded. Rate this a design weakness that becomes exploitable with growth, not a today-emergency.

**Fix.** Widen the code, expire it, make it single-use, and throttle the RPC itself (the only place a throttle actually binds).

```ts
// src/lib/mutations/household.ts
import { randomBytes } from 'crypto';
// Crockford base32, no I/L/O/U — still human-readable, but 10 chars = 50 bits.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function generateInviteCode(): string {
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => ALPHABET[b % 32]).join('');
}
```

```sql
-- expire codes and make them single-use
alter table public.household_invites
  alter column expires_at set default now() + interval '24 hours',
  add column if not exists redeemed_at timestamptz;

-- inside join_household(), replace the lookup with:
--   select household_id into target_household
--     from public.household_invites
--    where code = invite_code
--      and redeemed_at is null
--      and (expires_at is null or expires_at > now())
--      for update;
--   ...and on success:  update public.household_invites
--                          set redeemed_at = now() where code = invite_code;
```

`createInvite` should set `expires_at` explicitly rather than relying on the column default, and should retry on the (now vanishingly unlikely) primary-key collision instead of throwing.

---

### Direct PostgREST access defeats every app-layer control, including the `expenses_update` gap

**Status: fixed, using this doc's own second option** — `0007_expense_attribution.sql` ships the trigger, not the `user_id = auth.uid()` policy check from the first option (which this doc itself flags as breaking cross-member editing per `src/app/api/expenses/[id]/route.ts:24-25`). One difference from the sketch below: the shipped trigger `raise exception`s on a blocked change rather than silently coercing (`new.user_id := old.user_id`) — a client attempting the forbidden PATCH gets an error it can surface, not a 200 that quietly did nothing. The trigger also had to special-case the `on delete set null` FK action from the `expenses.user_id` cascade fix (that FK action is itself a real UPDATE the trigger sees) — see `REVIEW.md` P0 item 5 for how.

**Severity:** Medium · **Exploitability:** Practical (for a co-member)

**Evidence.** `src/lib/supabase/client.ts:4-8` ships the anon key to the browser; the JWT lives in a JS-readable cookie. The app's own update paths are clean — `src/lib/mutations/expenses.ts:64-68` and `src/app/api/expenses/[id]/route.ts:18-22` both build `patch` from four explicitly named fields, so `household_id`, `user_id`, `created_at` and `currency` are unreachable through the API (the `currency` comment at `src/lib/validation.ts:5-7` is honoured: it is stamped server-side from the household at `src/lib/mutations/expenses.ts:29`). But the `expenses_update` policy (`0003:232`) is `using (is_household_member(household_id)) with check (is_household_member(household_id))` — no `user_id = auth.uid()`, unlike the insert policy one line above.

**Exploit scenario.** A co-member (insider, or someone who joined via a leaked invite) runs:

```bash
curl -X PATCH "$URL/rest/v1/expenses?id=eq.$SOME_ID" \
  -H "apikey: $ANON" -H "Authorization: Bearer $MY_JWT" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"<the other member uuid>","currency":"XXX","amount_minor":999999}'
```

RLS permits it: the row stays in a household they belong to, which is all the policy checks. Impact: attribution is falsified (the app's whole `src/lib/attribution.ts` display is now lying about who spent what), and `currency` — the one field the app deliberately refuses to accept from clients — is freely rewritable, corrupting the currency-stability invariant. They cannot move a row to another household (the `with check` blocks that), so this is integrity-within-tenant, not cross-tenant. In a two-person expense tracker the practical harm is "my partner can rewrite history and blame me for it", which is exactly the kind of dispute this app exists to settle.

**Fix.** Close it in the policy, since that is the only layer the attacker cannot skip:

```sql
drop policy "expenses_update" on public.expenses;
create policy "expenses_update" on public.expenses for update
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id) and user_id = auth.uid());
```

If cross-member editing of a shared pool must stay possible (it is a deliberate product decision per the comment at `src/app/api/expenses/[id]/route.ts:24-25`), then instead pin the immutable columns with a trigger:

```sql
create or replace function public.expenses_freeze_immutable()
returns trigger language plpgsql as $$
begin
  new.user_id      := old.user_id;
  new.household_id := old.household_id;
  new.currency     := old.currency;
  new.created_at   := old.created_at;
  return new;
end $$;
create trigger expenses_freeze before update on public.expenses
  for each row execute function public.expenses_freeze_immutable();
```

The trigger is the better fit here: it preserves the shared-pool product behaviour while making the app's stated invariants actually enforceable rather than merely observed by well-behaved clients.

---

### Auth cookies are readable by JavaScript

**Severity:** Medium · **Exploitability:** Conditional (requires an XSS or a malicious dependency)

**Evidence.** `node_modules/@supabase/ssr/dist/main/utils/constants.js:4-8` — `DEFAULT_COOKIE_OPTIONS = { path: "/", sameSite: "lax", httpOnly: false, maxAge: 400 days }`. Neither `src/lib/supabase/server.ts:20-29` nor `src/proxy.ts:23-25` overrides `options`, and they cannot meaningfully: `src/components/auth/LoginForm.tsx:26` signs in with the *browser* client, which must read the session from `document.cookie` on the client side, so `httpOnly` is structurally unavailable in this architecture.

**Exploit scenario.** Preconditions: script execution in the app's origin — a stored XSS (note that `note` accepts 500 arbitrary characters, `src/lib/validation.ts:20`, and display names 40; React escapes these today, so this is about future code or a `dangerouslySetInnerHTML`), or a compromised npm dependency. Steps: `document.cookie` yields the full access + refresh token. Impact: the tokens are *portable* — the attacker replays them against `https://<project>.supabase.co` from their own machine, outside the app, and the refresh token (rotation is on but reuse interval is 10s, `config.toml:171-174`) lets them mint fresh access tokens indefinitely. Signing out in the victim's browser does not help once the tokens have left it, until the refresh token is revoked. This is why "no CSP" (below) is worse here than in a typical app.

**Fix.** Given the browser-client login, the honest mitigations are compensating rather than eliminating:

1. Add a CSP so that an injection cannot execute or exfiltrate (see the headers finding — this is the single highest-value change).
2. Bound the blast radius with session timeboxing, which the config already scaffolds:

```toml
# supabase/config.toml — currently commented out at lines 271-276
[auth.sessions]
timebox = "720h"            # hard cap, forces a real re-login
inactivity_timeout = "336h" # idle sessions die
```

3. If the tokens ever need to be genuinely `httpOnly`, sign in through a Server Action / Route Handler using the server client instead of `LoginForm`'s browser client, and drop `createBrowserClient` from the auth path entirely. That is a real refactor and I would only do it if the threat model changes.

---

### No rate limiting on any abusable endpoint

**Severity:** Medium · **Exploitability:** Practical

**Evidence.** Nothing in `src/` throttles anything. Surfaces, honestly triaged:

| Surface | Exposure | Real risk |
|---|---|---|
| `POST /rest/v1/rpc/join_household` (and `/api/household/join`) | Any authenticated user | **The one that matters** — unbounded invite guessing, app-layer limiter bypassable |
| `POST /auth/v1/token` (login) | Unauthenticated | Partly covered: `config.toml:207` caps sign-in/sign-up at 30 per 5 min per IP |
| `POST /auth/v1/signup` | Unauthenticated | Same 30/5min cap; gated by the allowlist trigger |
| `GET/POST /rest/v1/allowed_emails` | Unauthenticated | Covered by the first finding — fix the grants, not the rate |
| `/api/expenses`, `/api/summary`, … | Authenticated | Low: RLS-scoped, and abuse costs the attacker as much as the victim |
| `/api/keepalive` | `CRON_SECRET` bearer, `src/app/api/keepalive/route.ts:11-15` | Correctly gated, including the `!secret` case — good |

The load-bearing observation is that a Next.js middleware limiter cannot protect `join_household`, because the attacker holds the anon key and calls Postgres directly.

**Recommended mitigation (one, free-tier compatible): throttle inside the RPC.** It costs nothing, needs no external service, and cannot be bypassed by skipping the app.

```sql
create table if not exists public.join_attempts (
  user_id  uuid        not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists idx_join_attempts_user
  on public.join_attempts (user_id, attempted_at desc);
alter table public.join_attempts enable row level security;  -- no policies: definer-only

-- at the top of join_household(), after the auth.uid() check:
--   if (select count(*) from public.join_attempts
--        where user_id = me and attempted_at > now() - interval '1 hour') >= 10 then
--     raise exception 'Too many attempts. Try again later.';
--   end if;
--   insert into public.join_attempts (user_id) values (me);
```

Ten guesses per hour per account turns a 5-day distributed brute force into roughly 24,000 years per account, and an attacker who wants to parallelise now has to create accounts — which the allowlist (once fixed) prevents. Add `'Too many attempts. Try again later.'` to `KNOWN_JOIN_ERRORS` in `src/app/api/household/join/route.ts:12-15` so it surfaces as a clean 400 rather than a 500. A periodic `delete from public.join_attempts where attempted_at < now() - interval '1 day'` (fold it into the existing keepalive cron) keeps the table trivial.

---

### Unvalidated `next` parameter in the auth callback

**Severity:** Low · **Exploitability:** Conditional (and currently dormant)

**Evidence.** `src/app/auth/callback/route.ts:18` reads `next` from the query string and `:30` does `NextResponse.redirect(`${origin}${next}`)` with no validation. String concatenation of a URL is the specific mistake: `next=@evil.tld` produces `https://app.example.com@evil.tld`, where `app.example.com` is parsed as *userinfo* and the browser navigates to `evil.tld`. Backslash and `//` variants are worth assuming exploitable too rather than reasoning case-by-case about browser URL normalisation.

**Exploit scenario.** Dormant today: `src/components/auth/LoginForm.tsx:26` uses password sign-in, which never reaches this route (as the file's own comment at `:8-9` notes), and there is no OAuth or magic-link flow configured. It activates the moment one is added. Preconditions: a valid `code` in the URL, since the error path (`:27`) redirects safely. The interesting chain is an attacker sending a victim a link containing the *attacker's own* code plus `next=@evil.tld` — the victim gets logged into the attacker's account and is then bounced to a phishing page carrying the app's referrer. Low impact, but it is three lines to close and easy to forget once OAuth ships.

**Fix.**

```ts
const nextParam = searchParams.get('next') ?? '/';
// Same-origin, path-only: rejects "@evil.tld", "//evil.tld", "https://evil.tld", "\\evil.tld".
const next =
  /^\/(?!\/|\\)[\w\-./?%&=#]*$/.test(nextParam) ? nextParam : '/';
...
const response = NextResponse.redirect(new URL(next, origin));
```

`new URL(next, origin)` is the belt to the regex's braces — resolve against the origin rather than concatenating, so a bypass of the pattern still cannot change hosts.

---

### Weak password policy and no confirmation requirement

**Severity:** Low · **Exploitability:** Conditional

**Evidence.** `supabase/config.toml:182` — `minimum_password_length = 6`; `:185` — `password_requirements = ""` (no complexity class required); `:226` — `enable_confirmations = false`, so an email address is never proven; `:297-312` — MFA enrolment disabled for both TOTP and phone. Supabase's built-in 30-per-5-minutes-per-IP cap (`:207`) is what stands between a six-character password and an online guessing attack, and it is per-IP, so a distributed attempt degrades it.

**Exploit scenario.** Attacker knows a user's email — obtainable from the `allowed_emails` disclosure above, or simply guessed for a two-person app. They spray common six-character passwords from a rotating IP pool. Impact: full account takeover, which for this app means read/write on the household's entire financial history.

Note this config is the *local* CLI config; production values live in the dashboard and may differ. Confirm before acting — but the file is the only declaration in the repo and is what a fresh environment would be built from, so it should encode the intended posture regardless.

**Fix.**

```toml
[auth]
minimum_password_length = 12
password_requirements = "lower_upper_letters_digits"

[auth.email]
enable_confirmations = true
secure_password_change = true   # currently false at config.toml:228
```

Mirror these in the production dashboard. For a two-user app, enabling TOTP MFA (`config.toml:302-304`) is proportionate to the fact that the data is permanently readable once an account falls.

---

### CSRF: present in structure, not exploitable in practice

**Severity:** Info · **Exploitability:** Theoretical

The concern is well-founded in shape — `/api/*` Route Handlers get no automatic origin check (unlike Server Actions), they mutate state on POST/PATCH/PUT, and they authenticate purely from cookies. `POST /auth/signout` (`src/app/auth/signout/route.ts`) is likewise unprotected.

It does not work, for one reason: the Supabase auth cookies are `SameSite=Lax` (`node_modules/@supabase/ssr/dist/main/utils/constants.js:6`). A cross-site `fetch()` or auto-submitted form issuing POST/PATCH/PUT/DELETE does not carry them, so the request arrives anonymous and `requireHousehold()` returns 401 at `src/lib/api/http.ts:66`. And there are no state-changing GET endpoints — the one GET that does anything is `/api/keepalive`, which is bearer-gated — so the Lax top-level-navigation carve-out has nothing to aim at. The residual is Chrome's two-minute "Lax+POST" grace window for freshly-set cookies, which would require the victim to visit the attacker's page within two minutes of signing in, to achieve at most a forged expense entry or a signout.

I would not add CSRF tokens here. If you want the defence anyway, the cheap version is an `Origin` header check in `proxy.ts` for unsafe methods:

```ts
// src/proxy.ts, before the Supabase client is constructed
const method = request.method;
if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== request.nextUrl.host) {
    return new NextResponse('Forbidden', { status: 403 });
  }
}
```

This is defence-in-depth against a future cookie-attribute regression (e.g. a library default changing to `SameSite=None`), which is the honest reason to bother.

---

### Missing security headers

**Severity:** Low · **Exploitability:** Conditional

**Evidence.** `next.config.ts` defines no `headers()` function, so no CSP, no `X-Frame-Options`/`frame-ancestors`, no `Referrer-Policy`, no HSTS beyond Vercel's default.

**Consequence** (config detail is the Vercel reviewer's; this is the security reading): the absent CSP is what upgrades the non-`httpOnly` cookie finding from "bad if XSS" to "catastrophic if XSS" — with no `script-src` and no `connect-src`, an injected script both executes and exfiltrates the tokens freely. The absent `frame-ancestors` allows the app to be framed, and a UI-redress attack against this app has a genuinely destructive target: the expense delete controls and the "join household" form, both of which are single-click and irreversible. `Referrer-Policy` matters because of the `/edit/[id]` route — expense UUIDs leak in the `Referer` header to any external host the user navigates to.

**Fix.**

```ts
// next.config.ts
const nextConfig: NextConfig = {
  experimental: { useOffline: true },
  async headers() {
    const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: [
            "default-src 'self'",
            // Next's inline bootstrap needs 'unsafe-inline'; tighten to a nonce later.
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            `connect-src 'self' ${supabase}`,
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join('; ') },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      ],
    }];
  },
};
```

Ship it in report-only mode first (`Content-Security-Policy-Report-Only`) for a few days if you would rather not risk breaking the app.

---

### Session lifecycle: minor gaps

**Severity:** Low · **Exploitability:** Theoretical

`src/app/auth/signout/route.ts:6` calls `supabase.auth.signOut()`, which defaults to global scope — refresh tokens are revoked server-side and the cookies are cleared via the server client's `setAll`, so this is *more* complete than the common cookie-only mistake. Two residuals worth knowing rather than fixing: the already-issued access JWT stays valid until it expires (`jwt_expiry = 3600`, `config.toml:165`) because `getClaims()` verifies signatures locally with no revocation check — inherent to stateless JWTs, and the reason `jwt_expiry` should not be raised; and there is no session timebox (`config.toml:271-276`, commented out), so a session refreshes indefinitely — see the cookie finding for the config.

On user enumeration: `src/components/auth/LoginForm.tsx:31` renders Supabase's raw `error.message` verbatim. Supabase returns a uniform "Invalid login credentials" for both wrong-user and wrong-password, so the primary enumeration channel is closed — but rate-limit and state messages ("Email not confirmed") pass through unfiltered, which leaks account existence and, more mundanely, shows users raw API strings in a UI that is otherwise fully localised through `next-intl`. Map the handful of known codes to translated copy and fall back to a generic message.

---

### Data exposure in logs

**Severity:** Info · **Exploitability:** Theoretical

Every handler logs raw error objects — `src/app/api/expenses/route.ts:28,49`, `src/app/api/expenses/[id]/route.ts:35,59`, `src/lib/api/http.ts:74`, and so on. Supabase error objects carry `message`, `details` and `hint`, which for a constraint violation can include column names and offending values (an `amount_minor`, a `note`). These go to Vercel's log drain, not to clients — client responses are uniformly generic (`'Failed to load expenses'`, and `src/lib/api/http.ts:56` explicitly notes the raw Postgres error never reaches the client), and the Server Actions swallow errors entirely into translated strings. `src/app/api/household/join/route.ts:12-15` is a nice touch: only two known RPC exception messages are whitelisted through to the client as 400s, everything else becomes an opaque 500.

So the schema-leak-to-client threat is genuinely closed. What remains is that financial values may land in a third-party log retention system. For a two-person app this is proportionate; if it ever matters, log `error.code` and `error.message` rather than the whole object.

---

## What's done well

Several things here are better than typical, and are worth protecting during any refactor:

- **The DAL pattern is right.** `src/lib/auth/dal.ts:1-7` states the principle explicitly — authorization lives next to the data, not in middleware, not in layouts — and the code actually follows it. Every one of the ten route handlers calls `requireHousehold()` as its first statement, every Server Action calls `verifySession()` before touching input, and every page component re-checks and redirects. `proxy.ts` does session refresh *only*, and carries no authorization load whatsoever. This is exactly the Next.js 16 guidance, and it is the reason there is no auth-bypass finding in this review.
- **`requireHousehold()` centralises the decision.** One place defines what "not signed in" and "no household" mean, both as 401, so no handler can drift. The 500-with-generic-message path (`src/lib/api/http.ts:73-81`) is deliberate about not leaking.
- **No mass assignment anywhere.** Every update builds an explicit patch object field by field with `!== undefined` guards (`src/lib/mutations/expenses.ts:64-68`, `categories.ts:59-62`), so `household_id`, `user_id`, `created_at` and `currency` are structurally unreachable through the app. The `currency`-is-server-stamped decision is documented at `src/lib/validation.ts:5-7` and correctly implemented at `mutations/expenses.ts:22-29`.
- **Defence in depth on tenant scoping.** Every query carries `.eq('household_id', householdId)` *in addition to* RLS, and returns 404 rather than 403 on a miss, so the app does not confirm the existence of other households' rows. Belt and braces, correctly ordered.
- **Shared validation.** One Zod schema set (`src/lib/validation.ts`) drives the form, the API and the actions, so client and server cannot drift — and the server never trusts the client's copy.
- **`/api/keepalive` gets the bearer check right,** including failing closed when `CRON_SECRET` is unset (`route.ts:13`) — the case most implementations get wrong.
- **The RPC error whitelist** in the join route is a small, thoughtful piece of design: user-actionable errors surface, everything else is opaque.
- **`getClaims()` over `getUser()`** is well-reasoned and documented (`dal.ts:15-23`): local signature verification, with a safe network fallback for legacy HS256 projects. Correct for server-side decisions, and `cache()`-wrapping it keeps the cost at one call per request.
