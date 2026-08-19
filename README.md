# Kapa

[![CI](https://github.com/roman-mik/kapa/actions/workflows/ci.yml/badge.svg)](https://github.com/roman-mik/kapa/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Live demo](https://img.shields.io/badge/demo-live-000000?logo=vercel&logoColor=white)](https://expenses-tracker-kapa4.vercel.app)
![Next.js](https://img.shields.io/badge/Next.js-App_Router-000000?logo=nextdotjs&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?logo=supabase&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)

Kapa is the umbrella for two household apps: **Pocket** (`/pocket`), a warm monthly
spending-cap tracker — one cap, every expense in two taps, always know what's left — and
**Horizon** (`/horizon`), a multi-currency cashflow projector. `/` is a public landing page
that chooses between them.

**[Try the live demo →](https://expenses-tracker-kapa4.vercel.app)**

Built with **Next.js** (App Router) + **Supabase** (Postgres/Auth) + **Tailwind v4**, deployed on **Vercel**. See [`docs/PLAN.md`](./docs/PLAN.md) for the full roadmap.

This is a **pnpm + Turborepo workspace**: the app lives in `apps/web`, shared code (currently just
a placeholder) in `packages/ui`, and `supabase/` stays at the repo root since it's the backend for
every app in the workspace. Root-level `pnpm run <script>` commands (below) fan out to the
workspace via Turborepo — run them from the repo root, not from inside `apps/web`.

## Architecture at a glance

- **Monorepo** — pnpm + Turborepo; `apps/web` (Next.js App Router), `packages/ui` (shared
  components), `supabase/` (migrations, RLS policies) at the root.
- **Data model** — household-scoped expenses and caps behind Postgres row-level security, so
  every query is authorized at the database, not just the app layer.
- **Release pipeline** — a merged [release-please](https://github.com/googleapis/release-please)
  PR is the only path to production. CI applies pending Supabase migrations *before* the app
  deploys, so the database is never behind the code that's about to depend on it (see
  [Deploy](#deploy-free-tier) below).
- **Generated types stay honest** — `pnpm run gen:types` regenerates `database.types.ts` from the
  live schema; CI diffs it on every PR touching `supabase/**`, so a stale commit fails the build.
- **Tested at the RLS boundary** — CI runs pgTAP tests directly against Postgres, plus integration
  tests that exercise real query/mutation code through an actual per-user JWT rather than a
  bypass, so row-level security is verified, not assumed (see [CI](#ci) below).

## Local development

```bash
pnpm install
supabase start                     # boots local Postgres/Auth/Studio in Docker
supabase db reset                  # applies supabase/migrations/* to it
pnpm run gen:types                  # regenerates src/lib/supabase/database.types.ts from that schema
```

Re-run `gen:types` and commit the result after any migration — CI regenerates and diffs it
on every PR touching `supabase/**` or `apps/web/src/lib/supabase/**`, so a stale commit
fails the build.

`supabase start` prints the local `API URL` and keys — copy them into `.env.local`:

```bash
cp .env.local.example .env.local
# NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
# NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<the PUBLISHABLE_KEY supabase start printed>
pnpm run dev                        # http://localhost:3000
```

(`supabase status` reprints the same values later, if the terminal with the original `start` output is gone.)

**Creating the first user.** There's no self-service sign-up screen — the app is invite-only by
design (see [Deploy](#deploy-free-tier) below) — so seed one by hand via Supabase Studio
(`http://127.0.0.1:54323`, opened automatically by `supabase start`):

1. **SQL Editor** → `insert into public.allowed_emails (email) values ('you@example.com');` — the
   allowlist trigger (`0002_optional_allowlist.sql`) rejects any sign-up whose email isn't on this
   list first.
2. **Authentication → Users → Add user** → same email, a password, and check **Auto Confirm User**
   (the app uses password auth, not magic links — `src/components/auth/LoginForm.tsx`).
3. Sign in at `http://localhost:3000/login`. `handle_new_user()` seeds a household-of-one, a
   default cap, and five starter categories automatically.

Repeat step 1 for a second address to test the household-sharing flow (`/household` → generate an
invite code → sign in as the second user → redeem it).

## Environment variables

| Var | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → publishable key |
| `CRON_SECRET` | Any random string; set the same value in Vercel → Project Settings → Environment Variables. Vercel sends it automatically as the `Authorization` header on cron requests — see [Keep-alive](#keep-alive) below. |
| `HEALTHCHECK_URL` | Optional. A [healthchecks.io](https://healthchecks.io) check's ping URL (e.g. `https://hc-ping.com/<uuid>`), set in Vercel → Project Settings → Environment Variables. See [Keep-alive](#keep-alive) below. |

The app runs without these (landing page only); auth and data need them.

## Deploy (free tier)

1. **Push to GitHub** — create a repo and push this project.
2. **Supabase** — create a free project at [supabase.com](https://supabase.com); copy the URL + publishable key. Run `supabase link` then `supabase db push` once by hand to apply `supabase/migrations/*` to it (this is the same schema `supabase db reset` applies locally — see [Local development](#local-development) above). After this first push, add `SUPABASE_DB_URL` (Settings → Database → Connection string, session pooler, percent-encoded, port 5432) as a repo secret — every release after this one applies new migrations automatically (step 4).
3. **Vercel** — import the GitHub repo at [vercel.com](https://vercel.com); add the env vars above; deploy.
4. A merged release-please PR is the only path to production: `.github/workflows/release-please.yml`'s
   `deploy` job (gated on `needs: [release-please, ci]` and
   `releases_created == 'true'`) first runs `supabase db push --db-url
   "$SUPABASE_DB_URL"` so the database is never behind the code it's about to
   receive, then `vercel deploy --prod` (no `--prebuilt`), which builds on
   Vercel's own infrastructure — the only place the Sensitive
   `NEXT_PUBLIC_SUPABASE_*` vars decrypt — rather than building locally in
   Actions. `apps/web/vercel.json`'s `ignoreCommand` disables Vercel's own
   auto-deploy-on-push so this workflow stays the only trigger. Because
   migrations apply before the deploy, every migration merged to `main` must
   stay backward compatible with the *previous* release for the brief window
   until the new app code lands.
5. **Lock down auth** — Supabase dashboard → Authentication → Providers → Email → Site URL and Additional Redirect URLs should point at the deployed domain (`https://your-app.vercel.app` and `/auth/callback`), which `auth/callback/route.ts` needs for its OAuth/magic-link/email-confirmation exchange. Then Authentication → Sign In / Providers → turn **"Allow new users to sign up" OFF** — `allowed_emails` (see [Local development](#local-development)) is a backstop, not the primary gate; this toggle is.

## Keep-alive

Supabase free projects pause after ~7 days of inactivity. `vercel.json` schedules a daily cron
against `GET /api/keepalive`, which does one trivial read to keep the project warm — no data is
exposed. Requires `CRON_SECRET` to be set (see the table above); without it the route 401s and
the cron does nothing useful, so set it before relying on this.

The read itself uses the cookie-based Supabase client, so a real RLS failure returns an empty
result with `error: null` rather than an error — the route can't tell that apart from "no
households yet" from its own response alone. And if Vercel's cron scheduler stops firing
entirely, nothing runs to report that at all. `HEALTHCHECK_URL` (optional, see the table above)
closes both gaps: set it to a [healthchecks.io](https://healthchecks.io) check's ping URL
("Simple" schedule, expected daily) and the route pings it on every successful run, `/fail` on a
DB error. healthchecks.io flags the check as down once its expected-ping window passes on its
own — independent of whether the route ever got a chance to ping it — so a stopped cron, a down
database, and a down app are all visible the same way. A ping failure never fails the route, and
the check is skipped entirely when `HEALTHCHECK_URL` is unset, so local/preview runs are
unaffected.

## Backups & restore

Supabase's free tier has no PITR and no downloadable daily backups (those start on Pro) — there
is no copy of the data anywhere but the one live project unless this workflow is set up and
working. `.github/workflows/backup.yml` dumps schema + data daily via `supabase db dump`,
encrypts with `gpg`, and pushes to a private `kapa-backups` repo (plus a 90-day GitHub Actions
artifact as a second copy). See the comment at the top of that file for the three secrets it
needs and the one-time setup.

**An untested backup is a belief about a backup, not a backup.** To restore:

```bash
# 1. Decrypt and unpack the newest dump
gpg --decrypt --passphrase "$BACKUP_PASSPHRASE" -o kapa.tar.gz kapa-<date>.tar.gz.gpg
tar xzf kapa.tar.gz   # → schema.sql, data.sql

# 2. Restore into a database that already has this repo's migrations applied —
#    NOT the raw schema.sql if the target already has a schema (see below).
#    Local: supabase start && supabase db reset   (applies supabase/migrations/*)
#    Fresh Supabase Cloud project: supabase db push --db-url "$NEW_PROJECT_DB_URL"

# 3. Load the data on top
psql "$DB_URL" -f data.sql

# 4. Verify: sign in, confirm the current month's total matches what you expect.
```

Two things worth knowing, confirmed by an actual restore drill against the local stack (2026-08,
`supabase` CLI 2.114.0) rather than assumed:

- **`data.sql` is directly restorable as-is** — `supabase db dump --data-only` opens with
  `SET session_replication_role = replica`, which disables every trigger (including
  `on_auth_user_created` and `expenses_freeze`) and FK-checking trigger for the duration of the
  load. The predicted failure modes — the new-user trigger firing and seeding a duplicate
  household, FK insert-ordering fights — did **not** reproduce; the tool already handles both.
- **Restore onto a schema, not into nothing.** `schema.sql` from `supabase db dump` (no
  `--data-only`) is there for reference/disaster recovery of the schema itself, but the normal
  path is to stand up a target that already has this repo's migrations applied (step 2 above) and
  load only `data.sql` on top — that's what was actually drilled and confirmed working.
- `auth.users` **is** included in the dump (verified by inspecting `data.sql` — a `pg_dump`
  flag/schema omission was the review's stated risk here, but the CLI includes it by default).

Re-run this drill after any migration that changes triggers or constraints on a table the dump
touches, and after any `supabase` CLI major-version bump — the trigger-disabling behavior above is
a CLI implementation detail, not a documented contract.

## Export your data

`GET /api/export` (linked from `/settings`) downloads the household's entire expense history as
CSV — the only user-accessible backup, and the only copy of the data outside the one Supabase
project until the automated backup above is set up. Amounts are in minor units, the same integer
the app stores (e.g. cents for a 2-decimal currency, whole units for RSD) — not the display value —
to avoid float rounding errors on the way out.

## CI

`.github/workflows/ci.yml` runs `format:check`, `lint`, `typecheck`, `test`, and `build` on every
push to `main` and every PR. `pnpm run typecheck` is `next typegen && tsc --noEmit` — the `typegen`
step regenerates Next's route-level types so `tsc` works standalone, without a prior `next build`.

Between `supabase start` and `supabase stop`, CI also runs `pnpm run test:db` (pgTAP, against real
Postgres as the BYPASSRLS superuser), `pnpm run test:integration` (application code —
`lib/queries/*`/`lib/mutations/*` — run unchanged against that same database, but through a real
per-user JWT, so RLS actually applies), and `pnpm run gen:types` followed by `git diff --exit-code`
on `database.types.ts`, so a migration that lands without regenerating the committed types fails
the build. `pnpm test` alone (`vitest run --project node --project jsdom`) skips all of that and
stays fast — it doesn't need Supabase running at all.

## Adding a language

UI language is per-user (`profiles.locale`), not per-URL — there's no `/en`/`/ru` prefix. Resolution
order: the `KAPA_LOCALE` cookie → `Accept-Language` → `en` default (see `src/i18n/request.ts`).
Users change it on `/settings`.

To add a locale:

1. Add it to `locales` in `src/i18n/routing.ts` and the `profiles.locale` check constraint
   (new migration under `supabase/migrations/`).
2. Add a `messages/<locale>.json` with the same keys as `messages/en.json` — `pnpm test` fails if
   the key sets ever drift (`src/test/messages.test.ts`).
3. Add the label to `Settings.localeXx` in every message file and to the `localeLabel` map in
   `src/components/settings/LocaleForm.tsx`.

## Design system

The "Organic" tokens (cream / terracotta / sage, Caprasimo + Figtree) live in `src/app/globals.css` under Tailwind v4's `@theme`. Utilities: `bg-bg`, `bg-surface`, `text-ink`, `bg-accent`, `text-sage-700`, `rounded-lg`, `shadow-md`, `font-heading`.
