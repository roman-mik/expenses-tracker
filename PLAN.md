# Kapa — Go-Live Plan

*A monthly "spending cap" tracker. One cap, every expense in two taps, always know what's left.*

> **Status:** Planning. Web-first (Next.js on Vercel + Supabase), free tier only, structured so a mobile app can later reuse the same backend.

---

## 0. Assumptions (veto any of these)

These shape the whole plan. If one is wrong, tell me and I'll adjust.

1. **Multi-user with accounts.** Anyone can sign up; each user sees only their own data (Supabase Auth + Row-Level Security). This is the most future-proof choice for the eventual mobile app. *(Alternative: single-user personal app — simpler, but harder to grow.)*
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
| Safe daily | `remaining / max(daysLeft, 1)` |
| Elapsed days | `max(daysInMonth − daysLeft + 1, 1)` |
| Even pace | `cap × (elapsed / daysInMonth)` |
| Pace gap | `evenPace − spent` (positive = under pace, warm copy; negative = ahead of pace, gentle nudge) |
| Month projection | `(spent / elapsed) × daysInMonth` — "if today were the whole month" |
| Spent % | `min(100, round(spent / cap × 100))` |

**Design principle carried into the build:** never scold. Nearing the cap only shifts color and speaks gently; going over recalculates a *lower* safe-daily "recovery plan" instead of blocking. Copy is warm.

### Screens
- **Home** — hero with *Left to spend*, *days until reset*, *safe a day*, spent/left bar, pace line, today's expenses, `+ Add expense`. Two states: **healthy** and **over-cap** (soft warning + recovery plan: "hold N days to X/day and next month starts clean").
- **Add expense** — amount keypad → category chips → optional note. Shows live "left after this" preview.
- **Set cap** — slider (40k–200k range in design, 20k–300k in props), live consequences (safe daily / weekly / vs. your average), last-month + 3-month-avg reference chips, "nudge me at 80%" toggle.
- **History** — grouped by day, category filter chips, month-to-date category breakdown bar.
- **Web overview** — wider layout: daily-spend bar chart with safe-daily reference line, quick-add, category breakdown, month-end projection.

### Design system ("Organic")
Cream ground `#f5ead8`, terracotta accent `#c67139`/`#8c491a`, sage "you're fine" voice `#8fa073`. Fonts: **Caprasimo** (figures/headings) + **Figtree** (UI). Pull the tokens straight from the design project's `styles.css`.

---

## 2. Tech stack (all free tier)

| Layer | Choice | Why / free-tier note |
|---|---|---|
| Framework | **Next.js (App Router)** — BE + web in one repo | Route Handlers give us the shared JSON API for mobile |
| Hosting | **Vercel** (Hobby) | Free; auto-deploys from GitHub; serverless functions for the API |
| Database + Auth | **Supabase** (Free) | Postgres + Auth + Row-Level Security; 500MB DB, 50k MAU — plenty to start |
| DB access | **Supabase JS client** server-side (or Drizzle ORM for typed queries) | RLS enforces per-user isolation even if a query is wrong |
| Styling | **Tailwind CSS** + design tokens from `styles.css` | Fast, matches the Organic system |
| Charts | **Recharts** or hand-rolled bars (design uses simple CSS bars) | Avoid heavy deps for the daily-spend chart |
| Forms/validation | **Zod** (shared client + server schemas) | One source of truth for expense/cap validation |
| State/data fetching | **TanStack Query** (or Next server components + actions) | Cache + optimistic "add expense" for the two-tap feel |
| PWA | `next-pwa` / manifest + service worker | Installable, offline-friendly add-expense |

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

profiles
  id            uuid  PK → auth.users.id
  display_name  text                              -- shown for expense attribution
  created_at    timestamptz

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

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/summary?month=YYYY-MM` | The whole home screen in one call: cap, spent, remaining, safeDaily, daysLeft, pace line, projection, category breakdown |
| `GET` | `/api/expenses?month=YYYY-MM&category=` | History, grouped/filterable |
| `POST` | `/api/expenses` | Add expense `{ amount, category_id, note?, spent_at? }` |
| `PATCH`/`DELETE` | `/api/expenses/:id` | Edit / remove |
| `GET`/`PUT` | `/api/cap` | Read / set `{ monthly_cap, nudge_enabled, nudge_pct }` |
| `GET`/`POST`/`PATCH` | `/api/categories` | List / add / rename / reorder / archive |
| `GET` | `/api/household` | Members (with display names + roles), active invite code, current user id |
| `POST` | `/api/household/invite` | Mint a fresh invite code for the caller's household |
| `POST` | `/api/household/join` | Redeem `{ code }` → merge into that household (via the `join_household` RPC) |

Every request resolves the caller's household once via `getHouseholdId(userId)` (`lib/auth/dal.ts`, `cache()`-wrapped) and passes `householdId` to the query/mutation layer; `user.id` is still passed to writes for attribution.

**RLS (membership-based).** Data tables use `is_household_member(household_id)`; `profiles` also allows co-members via `same_household(id)` (attribution). These are `SECURITY DEFINER` helpers so a membership check inside a policy doesn't recurse on `household_members`. Cross-household work (the join merge) runs inside the `join_household` definer RPC.

The derived-values formulas from §1 live in **one shared module** (`lib/kapa-math.ts`) imported by both the API and the UI, so web and mobile can never drift from the prototype's math.

---

## 5. Phased roadmap

### Phase 0 — Foundations (½–1 day)
- [ ] `create-next-app` (App Router, TypeScript, Tailwind), push to GitHub.
- [ ] Connect repo to **Vercel** → live URL on every push.
- [ ] Create **Supabase** project; add env vars to Vercel.
- [ ] Port Organic design tokens (colors, Caprasimo/Figtree fonts) into Tailwind config + global CSS.

### Phase 1 — Auth + data (1–2 days)
- [ ] Supabase Auth (email magic-link or Google). Login/logout, session handling.
- [ ] Run the schema migration (§3) + RLS policies. Seed default categories on first login.
- [ ] `lib/kapa-math.ts` with the §1 formulas + unit tests (this is the heart — test it).

### Phase 2 — Core loop, healthy state (2–3 days)
- [ ] **Home** screen (healthy state): hero, bar, pace line, today's list.
- [ ] **Add expense** flow with optimistic update (the "two taps" feel).
- [ ] **Set cap** screen with live consequences.
- [ ] `GET /api/summary` powering the home screen.

### Phase 3 — Full experience (2–3 days)
- [ ] **Over-cap** state + recovery-plan copy.
- [ ] **History** grouped by day + category filter + month breakdown.
- [x] **Web overview** layout with daily-spend chart + projection card.
- [ ] Category management (add/rename/reorder).

### Phase 4 — Polish & install (1–2 days)
- [ ] PWA manifest + service worker → installable, offline add-expense.
- [ ] 80% nudge (in-app banner first; push notifications are a later, native concern).
- [ ] Empty states, loading skeletons, error toasts, warm microcopy pass.
- [ ] Basic analytics (optional, free: Vercel Analytics or Plausible free tier).

### Phase 5 — Mobile (later, separate effort)
- [ ] Expo (React Native) app hitting the same `/api/*` endpoints.
- [ ] Share `lib/kapa-math.ts` + Zod schemas via a small internal package or copied module.
- [ ] Native push notifications for the nudge.

---

## 6. Free-tier limits to keep an eye on

| Service | Free ceiling | When it matters |
|---|---|---|
| Supabase | 500MB DB, 50k monthly active users, 2 projects, pauses after 1 week inactivity | The inactivity pause is the main early gotcha — a cron ping or occasional use keeps it warm |
| Vercel Hobby | 100GB bandwidth/mo, serverless function limits, **non-commercial use** | Fine for personal/beta; a real commercial launch eventually needs Pro |
| Custom domain | Not free (~€10/yr) | Optional — `*.vercel.app` works forever for free |

None of these block launch. The one to design around: **Supabase free projects pause after ~7 days of inactivity** — fine for a personal app, worth a keep-alive if you want it always instant.

---

## 7. Open questions (answer when convenient)

1. **Auth method** — email magic-link (simplest, no passwords) or Google sign-in, or both?
2. **Single cap vs. per-category caps** — the design is one global cap. Confirm we're *not* doing per-category budgets in v1 (the History screen shows category *breakdown*, not per-category limits).
3. **Timezone/month boundary** — hardcode `Europe/Belgrade`, or detect per user? (Matters for exactly when the month "resets".)
4. **Currency** — RSD-only for v1, or leave the door open for others from day one?
5. **App name** — the design calls it **Kapa** (URL `kapa.app`). Keep that, or is "Tracker" the working name?

---

## 8. Next step

On your go, I'll start **Phase 0**: scaffold the Next.js app, wire up Vercel + Supabase, and port the Organic design tokens — so you have a live (empty) deployed URL before we write a single feature.
