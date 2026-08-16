# Kapa

A warm monthly spending-cap tracker. One cap, every expense in two taps, always know what's left.

Built with **Next.js** (App Router) + **Supabase** (Postgres/Auth) + **Tailwind v4**, deployed on **Vercel**. See [`PLAN.md`](./PLAN.md) for the full roadmap.

## Local development

```bash
npm install
supabase start                     # boots local Postgres/Auth/Studio in Docker
supabase db reset                  # applies supabase/migrations/* to it
npm run gen:types                  # regenerates src/lib/supabase/database.types.ts from that schema
```

`supabase start` prints the local `API URL` and keys — copy them into `.env.local`:

```bash
cp .env.local.example .env.local
# NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
# NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<the PUBLISHABLE_KEY supabase start printed>
npm run dev                        # http://localhost:3000
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
2. **Supabase** — create a free project at [supabase.com](https://supabase.com); copy the URL + publishable key. Run `supabase link` then `supabase db push` to apply `supabase/migrations/*` to it (this is the same schema `supabase db reset` applies locally — see [Local development](#local-development) above).
3. **Vercel** — import the GitHub repo at [vercel.com](https://vercel.com); add the env vars above; deploy.
4. Every push to `main` auto-deploys.
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
push to `main` and every PR. `npm run typecheck` is `next typegen && tsc --noEmit` — the `typegen`
step regenerates Next's route-level types so `tsc` works standalone, without a prior `next build`.

Between `supabase start` and `supabase stop`, CI also runs `npm run test:db` (pgTAP, against real
Postgres as the BYPASSRLS superuser) and `npm run test:integration` (application code —
`lib/queries/*`/`lib/mutations/*` — run unchanged against that same database, but through a real
per-user JWT, so RLS actually applies). `npm test` alone (`vitest run --project node --project
jsdom`) skips both and stays fast — it doesn't need Supabase running at all.

## Adding a language

UI language is per-user (`profiles.locale`), not per-URL — there's no `/en`/`/ru` prefix. Resolution
order: the `KAPA_LOCALE` cookie → `Accept-Language` → `en` default (see `src/i18n/request.ts`).
Users change it on `/settings`.

To add a locale:

1. Add it to `locales` in `src/i18n/routing.ts` and the `profiles.locale` check constraint
   (new migration under `supabase/migrations/`).
2. Add a `messages/<locale>.json` with the same keys as `messages/en.json` — `npm test` fails if
   the key sets ever drift (`src/test/messages.test.ts`).
3. Add the label to `Settings.localeXx` in every message file and to the `localeLabel` map in
   `src/components/settings/LocaleForm.tsx`.

## Design system

The "Organic" tokens (cream / terracotta / sage, Caprasimo + Figtree) live in `src/app/globals.css` under Tailwind v4's `@theme`. Utilities: `bg-bg`, `bg-surface`, `text-ink`, `bg-accent`, `text-sage-700`, `rounded-lg`, `shadow-md`, `font-heading`.

## License

© 2026 Roman. All rights reserved. This code is publicly viewable but not licensed for reuse, redistribution, or modification.
