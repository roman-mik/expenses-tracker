# Kapa

A warm monthly spending-cap tracker. One cap, every expense in two taps, always know what's left.

Built with **Next.js** (App Router) + **Supabase** (Postgres/Auth) + **Tailwind v4**, deployed on **Vercel**. See [`PLAN.md`](./PLAN.md) for the full roadmap.

## Local development

```bash
npm install
cp .env.local.example .env.local   # fill in your Supabase keys
npm run dev                         # http://localhost:3000
```

## Environment variables

| Var | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → publishable key |
| `CRON_SECRET` | Any random string; set the same value in Vercel → Project Settings → Environment Variables. Vercel sends it automatically as the `Authorization` header on cron requests — see [Keep-alive](#keep-alive) below. |

The app runs without these (landing page only); auth and data need them.

## Deploy (free tier)

1. **Push to GitHub** — create a repo and push this project.
2. **Supabase** — create a free project at [supabase.com](https://supabase.com); copy the URL + publishable key.
3. **Vercel** — import the GitHub repo at [vercel.com](https://vercel.com); add the env vars above; deploy.
4. Every push to `main` auto-deploys.

## Keep-alive

Supabase free projects pause after ~7 days of inactivity. `vercel.json` schedules a daily cron
against `GET /api/keepalive`, which does one trivial read to keep the project warm — no data is
exposed. Requires `CRON_SECRET` to be set (see the table above); without it the route 401s and
the cron does nothing useful, so set it before relying on this.

## CI

`.github/workflows/ci.yml` runs `format:check`, `lint`, `typecheck`, `test`, and `build` on every
push to `main` and every PR. `npm run typecheck` is `next typegen && tsc --noEmit` — the `typegen`
step regenerates Next's route-level types so `tsc` works standalone, without a prior `next build`.

## Design system

The "Organic" tokens (cream / terracotta / sage, Caprasimo + Figtree) live in `src/app/globals.css` under Tailwind v4's `@theme`. Utilities: `bg-bg`, `bg-surface`, `text-ink`, `bg-accent`, `text-sage-700`, `rounded-lg`, `shadow-md`, `font-heading`.

## License

© 2026 Roman. All rights reserved. This code is publicly viewable but not licensed for reuse, redistribution, or modification.
