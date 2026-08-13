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
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public key |

The app runs without these (landing page only); auth and data need them.

## Deploy (free tier)

1. **Push to GitHub** — create a repo and push this project.
2. **Supabase** — create a free project at [supabase.com](https://supabase.com); copy the URL + anon key.
3. **Vercel** — import the GitHub repo at [vercel.com](https://vercel.com); add the two env vars above; deploy.
4. Every push to `main` auto-deploys.

## Design system

The "Organic" tokens (cream / terracotta / sage, Caprasimo + Figtree) live in `src/app/globals.css` under Tailwind v4's `@theme`. Utilities: `bg-bg`, `bg-surface`, `text-ink`, `bg-accent`, `text-sage-700`, `rounded-lg`, `shadow-md`, `font-heading`.

## License

© 2026 Roman. All rights reserved. This code is publicly viewable but not licensed for reuse, redistribution, or modification.
