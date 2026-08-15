# Kapa — Full Application Review

**Date:** 2026-08-15 · **Commit:** `5b3e835` (main) · **Stack:** Next.js 16.3.0, React 19.2, Supabase (@supabase/ssr 0.12.4), Tailwind v4, next-intl 4.13, Vercel Hobby + Supabase free tier

Thirteen independent reviews, one per aspect. Full detail lives in [`docs/review/`](docs/review/); this file is the index, the cross-cutting synthesis, and the prioritized plan.

| # | Aspect | Report | Headline |
|---|---|---|---|
| 1 | Security | [`review-security.md`](docs/review/review-security.md) | Registration bypass; app layer isn't the trust boundary |
| 2 | Database design | [`review-database.md`](docs/review/review-database.md) | `allowed_emails` has no RLS; invite codes are permanent bearer tokens |
| 3 | Operability & data lifecycle | [`review-operability.md`](docs/review/review-operability.md) | No backups; `ON DELETE CASCADE` destroys shared history |
| 4 | Domain math | [`review-domain-math.md`](docs/review/review-domain-math.md) | Today is double-counted; every user's daily allowance is ~4.5% low |
| 5 | Testing strategy | [`review-testing.md`](docs/review/review-testing.md) | RLS is executed zero times in the entire repo |
| 6 | API contract | [`review-api-contract.md`](docs/review/review-api-contract.md) | Delete the REST layer — bearer auth doesn't work at all |
| 7 | UI/UX design | [`review-uiux.md`](docs/review/review-uiux.md) | Contrast and labelling failures; no dark mode; chart hidden on mobile |
| 8 | Performance & PWA | [`review-performance-pwa.md`](docs/review/review-performance-pwa.md) | Measured bundles; `fra1` region is the one-line win |
| 9 | Supabase integration | [`review-supabase.md`](docs/review/review-supabase.md) | Proxy drops cache-control headers; errors flattened, codes never read |
| 10 | Architecture | [`review-architecture.md`](docs/review/review-architecture.md) | One layering bypass; writes have zero observability |
| 11 | Vercel & deployment | [`review-vercel.md`](docs/review/review-vercel.md) | Invalid `engines.node`; no security headers; CI doesn't gate deploys |
| 12 | Next.js conventions | [`review-nextjs.md`](docs/review/review-nextjs.md) | Clean — no deprecated API in use anywhere |
| 13 | Docs & i18n extensibility | [`review-docs-i18n.md`](docs/review/review-docs-i18n.md) | README doesn't reach a running app; two English leaks in RU |

---

## Executive summary

This is a well-built application. The Next.js 16 migration is complete and correct with no deprecated API in use, the CI pipeline runs real migrations against a real Postgres, money is stored as bigint minor units, month windows are genuinely timezone-aware including DST, and the component-level craft — copy that never blames the user, per-action busy state, `tabular-nums` on every figure — is better than most production apps.

The problems cluster in three places, and they share one root cause.

**The trust boundary is misplaced.** The browser holds the anon key and a JS-readable JWT, so any authenticated user can bypass every route handler and query PostgREST directly. That means the real security perimeter is the RLS policy set — and the RLS policy set is never tested, has one table with no policies at all, and has a write policy missing a check its sibling has. Several findings that look like application bugs are actually policy bugs, and several proposed application-layer fixes (rate limiting the join endpoint, CSRF tokens) would not bind.

**Data can be destroyed silently and permanently.** There are no backups of any kind on a tier with no PITR. `expenses.user_id → auth.users ON DELETE CASCADE` deletes a departed member's rows out of the *shared* pool. `join_household` moves expenses without checking the source household is single-member. Cross-currency merges leave rows that silently drop out of cap math. None of these raise an error; the user sees a plausible, wrong number.

**The core math is subtly wrong, and the tests encode the same misunderstanding.** Today is counted as both fully elapsed and fully spendable, so every user is handed a daily allowance about 4.5% below the correct figure, every day, while being told they're on pace.

Everything else — performance, UI polish, docs — is genuinely secondary and mostly cheap.

### Two premises corrected mid-review

Two claims from earlier agents were **wrong** and were caught by the performance reviewer measuring rather than reading. Noting them because I repeated them to you:

- `src/app/page.tsx:39` **already uses `Promise.all`** — it does not fan out to five sequential queries.
- `src/lib/auth/dal.ts:26` uses **`getClaims()`** (local JWT verification, no network). The proxy's `getUser()` at `src/proxy.ts:31` is therefore the *only* Auth round-trip, not a duplicated one. It's still worth removing, but the saving is one trip, not two.

---

## Cross-cutting themes

**RLS is load-bearing and unverified.** Rewriting every policy in `0003_households.sql:197-233` to `using (true)` — deleting tenant isolation outright — leaves all 192 unit tests and all 13 pgTAP assertions green. The unit tests use a fake with no concept of policies; the one pgTAP file sets `request.jwt.claims` but never `set local role authenticated`, so it runs as a BYPASSRLS superuser. *(Testing §2, Security §1, Database §9)*

**Silent wrongness is the dominant failure mode.** RLS denial returns an empty result, not a 403. The keepalive cron reads with an unauthenticated client, so RLS returns `[]` with `error: null` and the ping succeeds regardless of database state. Merged expenses vanish from cap math. Server Actions swallow errors in bare `catch {}`. In each case the app carries on displaying a confident, incorrect number. *(Operability §4, Supabase, Architecture §5)*

**Business rules are enforced where they can be bypassed, not where they bind.** The allowlist, the join flow, the `user_id`/`currency` immutability, and the amount validation all live in `src/`, which a co-member can route around via PostgREST. The fix for this class is consistently "move it into a policy, a constraint, or an RPC." *(Security §1/§5, Database §5)*

**`fake-supabase.ts` doesn't just under-test — it certifies behavior production doesn't have.** `.single()` fabricates a non-PostgREST error collapsing the 0-row and N-row cases; `onConflict` is ignored so two households with equal caps collide; no constraints, triggers or FKs fire on insert. *(Testing §3, Supabase)*

**Duplication between Server Actions and REST is now dead weight.** Bearer auth doesn't work at all — `requireHousehold()` takes no request object, so it structurally cannot read an `Authorization` header. The REST layer can't serve the mobile client it exists for, while `getSummary` and the whole `lib/` core would run unchanged inside Expo against supabase-js. *(API Contract §1)*

---

## Prioritized plan

### P0 — This week

1. ~~**Verify and fix the `allowed_emails` exposure.**~~ **Status: fixed** (`0005_lock_allowlist.sql`, branch `p0-lock-allowlist`). RLS enabled with no policies, `SELECT`/`INSERT`/etc. revoked from `anon`/`authenticated`, plus a lowercase-normalization constraint the trigger's `email = lower(new.email)` comparison depended on but nothing enforced. Verified locally: anon-key `GET /rest/v1/allowed_emails` now returns `42501`. **Still needs doing in production**: run the same curl against the live project, and set Authentication → "Allow new users to sign up" = OFF in the dashboard so the allowlist is a genuine backstop rather than the sole gate. *(Security, Critical)*
2. **Set up backups.** No `pg_dump` anywhere, no PITR on free tier. A complete GitHub Actions workflow (dump → gpg → private repo) is in the operability report. Then **test a restore** — `auth.users` schema, FK ordering, and `on_auth_user_created` firing during restore all break a naive first attempt.
3. **Fix `expenses.user_id → auth.users ON DELETE CASCADE`** (`0001:45`) to `ON DELETE SET NULL`. Migration 0003 repurposed the column to attribution but left the FK, so deleting a member erases their rows from the shared pool and retroactively changes the partner's totals.
4. **pgTAP RLS suite.** Add `set local role authenticated` and the supplied `rls.sql` (14 assertions). Expect existing assertions to break — *that breakage is the finding*. One afternoon, and it is the single highest-value change in the review.
5. **Fix the `expenses_update` policy** (`0003:232`) to include `user_id = auth.uid()`, or add an immutable-column trigger. Currently a co-member can PATCH PostgREST directly to forge attribution and rewrite currency.

### P1 — Next

6. **Fix the day-count double-count** (`kapa-math.ts:144,157`) → `completedDays = D − daysLeft − 1`. Add the reconciliation invariant as a test: an even-pace spender must always get `safeDaily == cap/D`. It fails today on every day of the month.
7. **Handle `cap = 0` / no cap set.** Currently renders "Over budget" and advises starting next month at 0; the guard at `RecoveryPlan.tsx:34` is vacuously true.
8. **`Math.floor` not `Math.round` on `safeDaily`** — rounding can bust the cap (999 remaining, 2 days → 500 × 2 = 1000).
9. **Fix `GET /api/cap` 500** (`api/cap/route.ts:12`, body on a 204) and unpin the test that asserts the bug as expected.
10. **Invite codes**: add expiry, single-use, and rate limiting *inside* the RPC (an app-layer limiter on `/api/household/join` is a non-fix — the attacker calls `rpc/join_household` directly). SQL in the security report.
11. **Guard `join_household`**: refuse when the source household has other members; refuse cross-currency merges outright.
12. **Error tracking** (Sentry free + `instrumentation.ts`/`onRequestError`) — but fix the bare `catch {}` blocks first, or it reports zero Server Action errors. Add healthchecks.io as a dead-man's switch on keepalive: ten lines, covers three failure modes.
13. **Accessibility batch**: no `<h1>` on any page, five forms with placeholder-only labels, secondary text failing 4.5:1 app-wide, primary CTA with an invisible focus ring. All mechanical.
14. **Security headers** — CSP especially. Auth cookies are necessarily `httpOnly: false`, which is what makes a missing CSP consequential rather than cosmetic.
15. **Fix `engines.node`** to `"24.x"` — Vercel rejects or ignores exact patch versions, so CI and prod can diverge.

### P2 — Worth doing

16. **`"regions": ["fra1"]` in `vercel.json`** — one line, biggest latency win against an EU Supabase. Then drop the proxy `getUser()` and add `api|` to its matcher.
17. **Delete the REST layer**; move `HouseholdPanel`'s two `fetch` calls to Server Actions, keep `/api/keepalive`, extract `lib/*` as a shared package for the eventual Expo client.
18. **Bundle**: move `signInWithOtp` to a Server Action (−64 KB gzip on `/login`, which ships Realtime/SIWE/passkey paths the app never uses); `pick()` next-intl namespaces (the full catalogue is inlined in every HTML response — 49% of gzipped `/login` HTML).
19. **Remove the redundant `router.refresh()`** in 8 components — the action response already carries the fresh RSC tree.
20. **Optimistic concurrency on expenses** — no `updated_at`, unconditional PATCH, so two members editing one expense is a silent lost update in a product whose premise is a shared pool.
21. **CSV export** — the user's only backup and a precondition for leaving or closing an account. No-deps route handler supplied.
22. **`leave_household` RPC** — there is currently no supported way to leave. Product decision required first (see below).
23. **Integration test layer** against the local Supabase CI already starts: two authenticated users, two households, 10 named cases.
24. **README** — clone-to-running currently fails; add `supabase start`, `db push`, `gen:types`, first-user creation, redirect URLs.
25. **Fix the two English leaks in the Russian UI**: `attribution.ts:9-10` returns `'you'`/`'partner'` verbatim (inject labels as params, as `date.ts:56-72` already does correctly); `HouseholdPanel.tsx:34,70` prefers untranslated `body?.error` over its own fallback.

### P3 — Deliberate deferrals

Dark mode · thumb-reachable primary action · `DailySpendChart` hidden on mobile despite being mobile-first · PWA tier (b) then scoped (d) for expense creation only · ADR backfill (magic-link decision is the only genuinely unrecoverable rationale) · Serbian (2–4h plain, ~1 day with script variants; the sole blocker is a `split('-')[0]` truncation at `request.ts:20-24`) · E2E (firm **no** for now — the dangerous failures are invisible in a browser).

---

## Open product questions

These need your decision before the corresponding fix can be designed:

1. **When a couple separates, who owns the shared history?** Options: both keep a full copy (recommended — the alternatives reproduce the cascade-deletion problem), creator keeps it, or split by attribution.
2. **Should a departed member's expenses stay in the pool?** This determines whether the FK becomes `SET NULL` with anonymized attribution, or something else.
3. **Should the app work offline?** Logging an expense at a checkout counter with bad reception is the product's core moment. Recommendation: honest app-shell caching now, an append-only offline write queue for *creation only* next (edits/deletes/cap changes disabled offline). A full offline read cache is rejected — a stale "left to spend" in a shared household invites a wrong spending decision.
4. **Is RSD-only still the intent?** Cross-currency household merges are currently silently corrupting; the cheap fix is to refuse them.
5. **Does `RecoveryPlan` ship the right feature?** It answers a different question than PLAN.md promises — the "hold N days to X/day" framing never appears; it ships a next-month cap instead. The arithmetic it does do is correct.

---

## What's genuinely done well

- **Next.js 16 conventions are clean.** No deprecated or removed API anywhere; async request APIs awaited correctly; authorization in the DAL rather than the proxy, exactly as the docs prescribe; `cache()` used deliberately with comments explaining which call sites it collapses.
- **CI runs the real database** — `supabase start` → pgTAP → build, on every PR.
- **The data model's hard parts are right**: bigint minor units, half-open timezone-aware month windows including DST, currency stamped server-side and never accepted from the client, RLS-recursion-avoiding definer helpers that all pin `search_path`.
- **Belt-and-braces household scoping** — every query adds `.eq('household_id', …)` even though RLS enforces it, so a policy regression degrades to empty rather than leaking.
- **No `service_role` key exists in the repo**; nothing sensitive in a `NEXT_PUBLIC_` var; no tracked env file.
- **The chart has real text alternatives** (`role="img"` + `sr-only` per-point list) — better than most production dashboards.
- **RU pluralization is CLDR-correct**, including the `=0` exact case.
- **Copy and product judgment**: `RecoveryPlan` suppresses its suggestion when the math would read as punitive; `ProjectionCard` refuses to render a wild early-month projection. Those are product decisions encoded in components, not afterthoughts.
- **Comments explain genuine non-obvious constraints** — the `DynamicServerError` note in `supabase/server.ts:6-10`, the Tailwind v4 scanning escape hatch, the missing-FK explanation in `queries/household.ts:44-59`.
