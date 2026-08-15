# Kapa — Go-Live Plan

*A monthly "spending cap" tracker. One cap, every expense in two taps, always know what's left.*

> **Status:** Planning. Web-first (Next.js on Vercel + Supabase), free tier only, structured so a mobile app can later reuse the same backend.

---

## 0. Assumptions (veto any of these)

These shape the whole plan. If one is wrong, tell me and I'll adjust.

1. **Multi-user with accounts, invite-only.** Sign-up is gated by an `allowed_emails` allowlist (`supabase/migrations/0002_optional_allowlist.sql`) — this is a private app, not open registration. Each user sees only their own household's data (Supabase Auth + Row-Level Security). Households grow via invite code (§3), not public sign-up. This is the most future-proof choice for the eventual mobile app while staying private.
2. **API-first backend.** Business logic lives behind Next.js Route Handlers (`/api/*`) returning JSON, so the future React Native/Expo app consumes the exact same endpoints. *(Alternative: server-render everything now, extract an API later.)*
3. **PWA first for mobile.** Ship an installable Progressive Web App so users can add it to their home screen — a native build (Expo) comes only once the web app is proven.
4. **Currency & locale.** RSD with Serbian number formatting (`sr-RS`), matching the design. Multi-currency is out of scope for v1 but the schema leaves room for it.
5. **Money stored as integers.** Amounts are whole RSD (the design has no decimals). Stored as `bigint` minor-unit-free integers to avoid floating-point errors.

---

## 1. What we're building (from the design)

**Kapa** = one monthly cap + a list of expenses. Everything else is *derived*, never stored:

| Derived value | Formula (verbatim from the design) |
|---|---|
| Remaining | `max(cap − spent, 0)` |
| Elapsed days | `daysInMonth − daysLeft` (first day → 1, last day → daysInMonth) |
| Safe daily | `remaining / max(daysLeft + 1, 1)` — today is still spendable |
| Even pace | `cap × (elapsed / daysInMonth)` |
| Pace gap | `evenPace − spent` (positive = under pace, warm copy; negative = ahead of pace, gentle nudge) |
| Month projection | `(spent / elapsed) × daysInMonth` — "if today were the whole month" |
| Spent % | `min(100, round(spent / cap × 100))` |
| Overspend | `max(spent − cap, 0)` |
| Recovery cap | a reduced *next-month* cap suggestion once over, computed from `overspend` |

**`daysLeft` convention (implemented in `lib/kapa-math.ts`, see its header comment):** `daysLeft` counts whole days remaining in the month *excluding* today, so it ranges `0..daysInMonth-1` and matches the UI's "N days until reset" countdown. This is why elapsed/safe-daily above differ from a naive reading — a single `+1` formula can't satisfy both the first-day (`elapsed = 1`) and last-day (`daysLeft = 0`) edge cases at once, so the `+1` lives on `safeDaily`'s denominator instead of on `elapsedDays`. This is the source of truth; it is exhaustively unit-tested in `lib/kapa-math.test.ts`.

**Design principle carried into the build:** never scold. Nearing the cap only shifts color and speaks gently; going over recalculates a *lower* safe-daily "recovery plan" instead of blocking. Copy is warm.

### Screens
- **Home** — hero with *Left to spend*, *days until reset*, *safe a day*, spent/left bar, pace line, today's expenses, `+ Add expense`. Two states: **healthy** and **over-cap** (soft warning + recovery plan: "hold N days to X/day and next month starts clean").
- **Add expense** — amount keypad → category chips → optional note. Shows live "left after this" preview.
- **Set cap** — slider (40k–200k range in design, 20k–300k in props), live consequences (safe daily / weekly / vs. your average), last-month + 3-month-avg reference chips, "nudge me at 80%" toggle.
- **History** — grouped by day, category filter chips, month-to-date category breakdown bar.
- **Web overview** — not a separate route: the `lg:` breakpoint of Home (`src/app/page.tsx`) adds a second column (`hidden lg:flex`) with a hand-rolled daily-spend bar chart (`DailySpendChart.tsx`, safe-daily reference line, no charting dependency) and the month-end projection card.

### Design system ("Organic")
Cream ground `#f5ead8`, terracotta accent `#c67139`/`#8c491a`, sage "you're fine" voice `#8fa073`. Fonts: **Caprasimo** (figures/headings) + **Figtree** (UI). Pull the tokens straight from the design project's `styles.css`.

---

## 2. Tech stack (all free tier)

| Layer | Choice | Why / free-tier note |
|---|---|---|
| Framework | **Next.js (App Router)** — BE + web in one repo | Route Handlers give us the shared JSON API for mobile |
| Hosting | **Vercel** (Hobby) | Free; auto-deploys from GitHub; serverless functions for the API |
| Database + Auth | **Supabase** (Free) | Postgres + Auth + Row-Level Security; 500MB DB, 50k MAU — plenty to start |
| DB access | **Supabase JS client** server-side | RLS enforces per-user isolation even if a query is wrong |
| Styling | **Tailwind CSS v4** via `@theme` in `src/app/globals.css` (no `tailwind.config.*`) + design tokens | Fast, matches the Organic system |
| Charts | **Hand-rolled CSS bars** (`src/components/home/DailySpendChart.tsx`) | Avoids a charting dependency for the daily-spend chart; Recharts was considered but not needed |
| Forms/validation | **Zod** (`src/lib/validation.ts`, server-side) | One source of truth for expense/cap validation |
| State/data fetching | **Next Server Components + Server Actions** (`src/app/actions/*`), `useTransition` for the optimistic "add expense" feel | TanStack Query was considered but wasn't needed — reads go straight through `src/lib/queries/*` in Server Components |
| PWA | Next 16's `app/manifest.ts` + the experimental `useOffline` hook/config | Installable to the home screen; navigations, prefetches, and Server Actions auto-retry once the connection returns. No third-party dep — `next-pwa` predates this repo's Next 16 pin and isn't used. |

**Money guardrail:** everything above stays on free tiers indefinitely for a personal/small-user app. The only things that could ever cost money — custom domain, Supabase paid tier past 500MB/50k MAU, Vercel Pro for team features — are all avoidable at this stage.

---

## 3. Data model (Supabase / Postgres)

Minimal, because most values are computed. The **household** is the unit of ownership: a solo user is just a household of one, and a couple/family sharing a cap is a household of 2+. Data tables are scoped by `household_id` and protected by membership RLS (see §4). Implemented in `supabase/migrations/0003_households.sql`.

```
households                                        -- the shared cap lives here
  id            uuid  PK
  currency      char(3) default 'RSD'             -- the cap's currency (moved off profiles)
  timezone      text    default 'Europe/Belgrade' -- month boundaries respect this
  created_at    timestamptz

household_members                                 -- who's in a household
  household_id  uuid  FK → households
  user_id       uuid  FK → auth.users
  role          text  default 'member'            -- 'owner' | 'member'
  joined_at     timestamptz
  PK (household_id, user_id), UNIQUE (user_id)     -- one household per user (v1)

household_invites                                 -- invite-code join flow
  code          text  PK                          -- short app-generated token
  household_id  uuid  FK → households
  created_by    uuid  FK → auth.users
  created_at    timestamptz
  expires_at    timestamptz null                  -- null = no expiry (v1)

profiles                                          -- currency/timezone live on households, not here
  id            uuid  PK → auth.users.id
  display_name  text                              -- shown for expense attribution
  created_at    timestamptz

allowed_emails                                    -- private/invite-only gate (§0.1)
  email         text  PK                          -- checked by a BEFORE INSERT trigger on auth.users;
                                                    -- sign-up raises 'Sign-ups are currently closed' if absent

categories
  id            uuid  PK
  household_id  uuid  FK → households              -- shared per household
  name          text                              -- Groceries, Eating out, Transport, Home, Fun
  color         text                              -- token from the Organic palette
  sort_order    int
  archived      bool  default false
  created_at    timestamptz

budget_settings                                   -- one row per HOUSEHOLD (the "cap")
  household_id   uuid PK FK → households
  monthly_cap    bigint                           -- e.g. 100000
  nudge_enabled  bool   default true
  nudge_pct      int    default 80                -- "nudge me at 80%"
  updated_at     timestamptz

expenses
  id            uuid  PK
  household_id  uuid  FK → households              -- aggregation/scope key (the shared pool)
  user_id       uuid  FK → auth.users             -- *added_by*: who logged it (attribution)
  category_id   uuid  FK → categories
  amount_minor  bigint                            -- whole RSD (minor units)
  currency      char(3)                           -- stamped from the household at insert
  note          text  null
  spent_at      timestamptz                       -- defaults now(); editable
  created_at    timestamptz
```

**Shared-cap model (v1 decisions)**
- **Full shared pool** — all members see every household expense; a member's spend counts toward the one shared cap.
- **Attribution** — `expenses.user_id` records who added each expense ("you" vs partner in the UI).
- **Join by invite code** — an owner mints a code (`household_invites`); the joiner redeems it via the `join_household(code)` RPC, whose data merges into the target household (their expenses move across, remapped to same-named categories; they adopt the target's cap).
- **One household per user** (the `UNIQUE (user_id)` on `household_members`) — drop that constraint later to allow multiple/switchable households.
- **Currency is household-level** — members share it; no FX conversion in v1 (non-matching currencies still surface separately in the summary).

**Notes**
- **Monthly reset** is not a stored event — it's a *query*. "This month's spend" = `sum(amount) where spent_at` falls in the current calendar month for the household's timezone. Changing the cap mid-month just changes one number; history is untouched (matches "the month adjusts, nothing is lost").
- **Last month / 3-month average** reference chips = simple `date_trunc('month', spent_at)` aggregates over `expenses`. No snapshot table needed.
- **Cap history** (optional, phase 3): add a `cap_changes` table only if you want to show "you raised your cap on the 12th". Not needed for v1.
- Seed the five default categories on first sign-in.

---

## 4. API surface (Next.js Route Handlers → reused by mobile)

Keep it thin and RESTish. Auth via Supabase session (web) / bearer token (mobile).

**Dual path (as shipped, not as originally imagined):** the web app does **not** consume `/api/*` for its own reads/writes. Reads go straight through `src/lib/queries/*` inside Server Components; writes go through Server Actions (`src/app/actions/{cap,categories,expenses}.ts`), giving `useTransition`-based optimistic UI without a client data-fetching library. The `/api/*` routes below are maintained in parallel as the contract for the future Expo app (§5) — today the only web caller of `/api/*` is `HouseholdPanel` (invite/join, via `fetch`).

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/summary?month=YYYY-MM` | The whole home screen in one call: cap, spent, remaining, safeDaily, daysLeft, pace line, projection, category breakdown |
| `GET` | `/api/expenses?month=YYYY-MM&category=` | History, grouped/filterable |
| `POST` | `/api/expenses` | Add expense `{ amount, category_id, note?, spent_at? }` |
| `PATCH`/`DELETE` | `/api/expenses/:id` | Edit / remove |
| `GET`/`PUT` | `/api/cap` | Read / set `{ monthly_cap, nudge_enabled, nudge_pct }` |
| `GET`/`POST`/`PATCH` | `/api/categories` | List / add / rename / reorder / archive (archive-only — no `DELETE`) |
| `GET` | `/api/household` | Members (with display names + roles), active invite code, current user id |
| `POST` | `/api/household/invite` | Mint a fresh invite code for the caller's household |
| `POST` | `/api/household/join` | Redeem `{ code }` → merge into that household (via the `join_household` RPC) |

Every request resolves the caller's household once via `getHouseholdId(userId)` (`lib/auth/dal.ts`, `cache()`-wrapped) and passes `householdId` to the query/mutation layer; `user.id` is still passed to writes for attribution.

Every household-scoped route resolves the caller via `requireHousehold()` (`lib/api/http.ts`), so "not signed in" and "no household" both come back as a uniform 401 across every route — this used to be inconsistent (some routes threw a raw error → 500 with leaked Postgres text) until Phase 6 unified it.

**RLS (membership-based).** Data tables use `is_household_member(household_id)`; `profiles` also allows co-members via `same_household(id)` (attribution). These are `SECURITY DEFINER` helpers so a membership check inside a policy doesn't recurse on `household_members`. Cross-household work (the join merge) runs inside the `join_household` definer RPC.

The derived-values formulas from §1 live in **one shared module** (`lib/kapa-math.ts`) imported by both the API and the UI, so web and mobile can never drift from the prototype's math.

---

## 5. Phased roadmap

### Phase 0 — Foundations (½–1 day)
- [x] `create-next-app` (App Router, TypeScript, Tailwind), push to GitHub.
- [x] Connect repo to **Vercel** → live URL on every push.
- [x] Create **Supabase** project; add env vars to Vercel.
- [x] Port Organic design tokens (colors, Caprasimo/Figtree fonts) into Tailwind config + global CSS.

### Phase 1 — Auth + data (1–2 days)
- [x] Supabase Auth (email+password — see §7). Login/logout, session handling.
- [x] Run the schema migration (§3) + RLS policies. Seed default categories on first login.
- [x] `lib/kapa-math.ts` with the §1 formulas + unit tests (this is the heart — test it).

### Phase 2 — Core loop, healthy state (2–3 days)
- [x] **Home** screen (healthy state): hero, bar, pace line, today's list.
- [x] **Add expense** flow with optimistic update (the "two taps" feel).
- [x] **Set cap** screen with live consequences.
- [x] `GET /api/summary` powering the home screen.

### Phase 3 — Full experience (2–3 days)
- [x] **Over-cap** state + recovery-plan copy.
- [x] **History** grouped by day + category filter + month breakdown.
- [x] **Web overview** layout with daily-spend chart + projection card.
- [x] Category management (add/rename/reorder).

### Phase 4 — Polish & install (1–2 days)
- [x] PWA manifest + `useOffline`-based graceful degradation → installable, expenses submitted offline retry automatically. (No service worker/write queue — a cold offline launch of the installed app still needs the network; that's a deliberate v1 cut, not a gap.)
- [x] 80% nudge (in-app banner; push notifications are a later, native concern).
- [x] Empty states, loading skeletons, error toasts, warm microcopy pass.
- [x] Basic analytics (Vercel Analytics + Speed Insights).

### Phase 5 — Mobile (postponed, separate effort)

**Status: postponed.** PWA (Phase 4) covers mobile for now; native is revisited later.

- [ ] Expo (React Native) app hitting the same `/api/*` endpoints.
- [ ] Share `lib/kapa-math.ts` + Zod schemas via a small internal package or copied module.
- [ ] Native push notifications for the nudge.

### Phase 6 — Hardening (found by a 2026-08-15 audit against this doc)

Shipped across four independent branches/PRs (`phase6/correctness`, `phase6/tooling`, `phase6/tests`, `phase6/ops`), each cut fresh off `main` rather than stacked.

**Correctness / user-visible**
- [x] **Sign-out**: `/settings` now posts to `src/app/auth/signout/route.ts`, linked from the home nav.
- [x] **`display_name` is settable** via a form on `/settings` (`src/lib/{queries,mutations}/profile.ts`, `src/app/actions/profile.ts`) — attribution in `TodayList`/`HistoryList`/`HouseholdPanel` now shows real names once set.
- [x] `src/app/login/page.tsx` is now a server component that reads `?error=` (`missing_code`/`closed`) and renders warm copy via `LoginForm`.
- [x] `HistoryList` delete failures now go through `useToast()`, matching every other mutation surface.
- [x] `PageLoadingShell` takes a `backHref` prop; `/edit/[id]`'s skeleton now points to `/history`.
- [x] The "no household" API response is unified via `requireHousehold()` (`lib/api/http.ts`) — see §4.

**Tooling**
- [x] `eslint.config.mjs` ignores `supabase/.temp/**` and `graphify-out/**` — `npm run lint` is 0 errors.
- [x] `typecheck` script added (`next typegen && tsc --noEmit`).
- [x] `.github/workflows/ci.yml`: `format:check` → `lint` → `typecheck` → `test` → `build`, on every push to `main` and every PR.

**Coverage**
- [x] Tests now cover `src/lib/queries/*`, `src/lib/mutations/*`, every `/api/*` route, every Server Action, and the auth DAL, via an in-memory fake Supabase client (`src/test/fake-supabase.ts`) plus 5 component tests. 53 → 184 passing tests.
- [ ] **Deferred:** `join_household` (`supabase/migrations/0003_households.sql`) — still the highest-risk untested code in the repo. No local Supabase stack exists to test it against (no `supabase/config.toml`, Docker not running, and the linked CLI project is the live hosted one — a DB-level test today would run against production). Needs `supabase init` + pgTAP in CI (Docker is available there) before this can close.

**Ops**
- [x] `vercel.json` schedules a daily cron against `GET /api/keepalive`, which does one trivial read behind a `CRON_SECRET` bearer check to keep the Supabase project warm.
- [x] README reconciled to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the code and `.env.local.example` already used it; only the README was stale), plus the new `typecheck`/CI docs.

### Phase 7 — Localization

- [ ] **i18n**: `next-intl`, English default/fallback, Russian second, Serbian stretch. Locale lives on `profiles.locale` (per-user, not per-household) — currency/number formatting (`sr-RS`) stays tied to the household regardless of UI language.

---

## 5.1 Backlog candidates (not yet planned)

Ideas worth doing eventually, but need more product thinking before they get a phase and a data model. Notes below are the open questions to resolve before scoping, not a committed design.

- **Budget rollover** — carry unspent (or overspent) cap into next month instead of a hard reset each month. Wanted: a visible "pool" with history, and symmetric carry-over (surplus *and* overspend both roll forward). Needs resolving:
  - The cap is currently a single *current* value per household (`budget_settings.monthly_cap`, no history) — rollover requires making it month-aware, likely a new per-month ledger table. Worth deciding how much of that infra is justified before Phase 5/6-sized effort.
  - How rollover interacts with the existing over-cap **recovery plan** copy (§1) — same-month guidance vs. an actual next-month number; risk of the two messages contradicting each other.
  - Whether rollover can compound indefinitely or should cap/decay somehow (a household that's been under-cap for a year — does the pool just keep growing?).
  - UI: does the pool get its own screen, or fold into History/Set Cap?
- **Recurring expenses** — predefine recurring items (rent, subscriptions) that show as a "pending" preview near their due date and get confirmed into a real expense rather than auto-posting. Needs resolving:
  - How far ahead a preview should surface, and where it's shown (Home? a dedicated list?).
  - What happens to an unconfirmed recurring item once its due date passes — carries over, expires, or nags?
  - Edit/pause/delete semantics for a recurring definition once expenses have already been generated from it.
  - Multi-currency household edge case (recurring item stamped in which currency?).

---

## 6. Free-tier limits to keep an eye on

| Service | Free ceiling | When it matters |
|---|---|---|
| Supabase | 500MB DB, 50k monthly active users, 2 projects, pauses after 1 week inactivity | The inactivity pause is the main early gotcha — a cron ping or occasional use keeps it warm |
| Vercel Hobby | 100GB bandwidth/mo, serverless function limits, **non-commercial use** | Fine for personal/beta; a real commercial launch eventually needs Pro |
| Custom domain | Not free (~€10/yr) | Optional — `*.vercel.app` works forever for free |

None of these block launch. The one to design around: **Supabase free projects pause after ~7 days of inactivity** — fine for a personal app, worth a keep-alive if you want it always instant.

---

## 7. Open questions — resolved

1. **Auth method** — **email + password** (f2da965 switched off magic-link; see `src/app/login/page.tsx`). Sign-up is invite-only via the `allowed_emails` allowlist (§0.1) — there is deliberately no public sign-up page.
2. **Single cap vs. per-category caps** — one global cap per household, confirmed. History shows category *breakdown*, not per-category limits.
3. **Timezone/month boundary** — per-household, defaulting to `Europe/Belgrade` (`households.timezone`, `supabase/migrations/0003_households.sql`); not hardcoded, but not currently user-editable from the UI.
4. **Currency** — RSD-only for v1, household-level, no FX conversion. Schema leaves room for more.
5. **App name** — **Kapa**.

---

## 8. Next step

Phases 0–4 are shipped and verified. Phase 6 (hardening) is done except one deliberately deferred item — pgTAP tests for `join_household`, blocked on a local Supabase stack (see Phase 6 → Coverage). Phase 5 (mobile, Expo) is postponed.
