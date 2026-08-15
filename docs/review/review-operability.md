## Operability, Observability & Data Lifecycle

**Overall assessment.** Kapa is unusually well-built *inside the request*: RLS is real, the DAL is disciplined, CI runs pgTAP against a real Postgres, route handlers log consistently, and the keepalive cron fails closed. What is missing is everything *outside* the request. There is no mechanism by which the owner learns that anything has broken — not a paused database, not a failing cron, not a migration that silently emptied a query, not a Server Action that has been returning "Couldn't save that just now" for three weeks. And there is no copy of the data anywhere but the Supabase free-tier project, which has no PITR. A year of two people's spending history currently sits on a single free-tier Postgres with no backup, no export, and no way for either person to take their data with them.

Ranked by "what would actually hurt": **(1) no backups** — one bad migration or one dropped project and the history is gone, permanently; **(2) `expenses.user_id → auth.users ON DELETE CASCADE`** (`supabase/migrations/0001_phase1_init.sql:45`) — deleting one member silently deletes their expenses out of the *shared* pool, retroactively changing the remaining partner's totals; **(3) no error visibility at all** — the three bare `catch {}` blocks in `src/app/actions/expenses.ts` throw away the only evidence of every save failure. Everything else on this list is a smaller correction.

The bar here is not enterprise SRE. It is roughly four hours of work: a scheduled `pg_dump` to a private location, Sentry's free tier wired through `instrumentation.ts`, a dead-man's-switch ping on the cron, a CSV export button, and one migration fixing the delete semantics.

---

### Part A — Operability

#### A1. No failure is detectable — the owner finds out by opening the app

**Severity: High** (ABSENT mechanism, not broken code)

Observability ends at `console.error`, which on Vercel Hobby means a log line in a dashboard nobody opens, retained for ~1 hour on Hobby's runtime log retention. Walking the realistic failure modes:

| Failure | How the owner finds out today | Cheapest fix |
|---|---|---|
| Supabase project paused (~7d inactivity) | The app 500s on next use. The keepalive cron *would* return 500 (`src/app/api/keepalive/route.ts:22`) but nothing reads that. | Dead-man's-switch ping (A5) — a missed daily ping emails within an hour. |
| Keepalive cron silently failing | **Never.** `CRON_SECRET` unset → route 401s → Vercel records a 401 as a completed invocation, not a failure. The README even warns about this (`README.md:36`) with no runtime check. | Same dead-man's-switch, pinged *after* the DB read succeeds. |
| Migration applied to prod that breaks a query | User-visible error or, worse, a *silently empty result* (RLS/PostgREST return `[]`, not an error). | Sentry (A2) catches the throw; a post-migration smoke check (A6) catches the empty case. |
| RLS change locking users out | Reads return `[]` with **no error** — the app renders a happy empty state showing a €0 month. This is the nastiest failure mode in the whole system: it looks like success. | pgTAP coverage already exists for `join_household`; extend to policy assertions. Plus A6's smoke check asserting a known row is visible. |
| Expired/rotated Supabase keys | Every request 401s; error boundary shows "Something slipped". | Sentry alert on error-rate spike; uptime monitor on an authenticated-free health route. |
| Vercel build failure on `main` | Vercel emails on failed deploys by default — this one is actually covered. But note CI is *decoupled*: `.github/workflows/ci.yml` runs on push to `main`, while Vercel builds the same commit independently. A commit can fail CI and deploy anyway. | Turn on Vercel's "wait for CI" / use a GitHub deployment gate, or accept it and rely on the CI failure email. |

The specific trap worth naming: **the keepalive read is vacuous.** `supabase.from('households').select('id').limit(1)` runs as an *unauthenticated* server client, so RLS filters it to zero rows and returns `{ data: [], error: null }`. It proves the project is awake (which is its job) but proves nothing about correctness, and it will not detect an RLS regression. That is fine for its stated purpose — just don't mistake it for a health check.

#### A2. Error tracking: Sentry free tier, wired for Server Actions specifically

**Severity: High** (ABSENT)

**Recommendation: Sentry free tier**, not log drains and not a self-rolled reporter. Reasoning: Vercel Hobby log drains are a paid feature and Hobby runtime logs are short-retention, so "just read the logs" is not available to this project. A self-rolled reporter (POST to a webhook) is ~30 lines but gives no grouping, no digest correlation, and no source maps. Sentry's free tier (5k errors/month, 1 user, email alerts) is far more than a 2-person household will ever generate, and the Next.js SDK handles the App Router plumbing that is genuinely fiddly to do by hand.

Setup for Next 16 App Router:

```bash
npx @sentry/wizard@latest -i nextjs
```

This creates `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts` (Next 16's replacement for `sentry.client.config.ts`), and wraps `next.config.ts` with `withSentryConfig`. Then `instrumentation.ts` at the project root:

```ts
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./sentry.server.config');
  if (process.env.NEXT_RUNTIME === 'edge') await import('./sentry.edge.config');
}

// Catches uncaught errors in Server Components, route handlers, AND Server
// Actions — Next passes routeType: 'action' for the latter.
export const onRequestError = Sentry.captureRequestError;
```

**The swallowed-catch problem is the important half of this.** `onRequestError` only fires for errors that *propagate*. Every bare `catch {}` in the actions layer — `src/app/actions/expenses.ts:33`, `:68`, `:89`, and identically `src/app/actions/cap.ts:28`, `src/app/actions/categories.ts:33,:69,:93`, `src/app/actions/profile.ts:30,:57` — converts a real failure into a friendly string and destroys the exception. Sentry will show *zero* errors from the entire Server Action surface until these are fixed. Note the asymmetry: route handlers do this correctly (`src/lib/api/http.ts:80`, `src/app/api/household/join/route.ts:32`) — the actions are the odd ones out.

Add one helper and use it everywhere:

```ts
// src/lib/observability/report.ts
import * as Sentry from '@sentry/nextjs';

/** Log + report a swallowed error. Never throws — reporting must not break the action. */
export function reportError(context: string, error: unknown): void {
  console.error(context, error);
  try {
    Sentry.captureException(error, { tags: { context } });
  } catch {}
}
```

```diff
// src/app/actions/expenses.ts
-  } catch {
+  } catch (error) {
+    reportError('addExpense', error);
     return { ok: false, error: t('saveFailed') };
   }
```

An ESLint rule to stop the regression, in `eslint.config.mjs`:

```js
{
  files: ['src/app/actions/**/*.ts'],
  rules: { 'no-empty': ['error', { allowEmptyCatch: false }] },
}
```

`error.tsx` and `global-error.tsx` already do the right shape of thing — they `console.error` and `track('error_shown', { digest })` (`src/app/error.tsx:22-25`, `src/app/global-error.tsx:17-18`). Add `Sentry.captureException(error)` alongside the existing `track()` call in both; the `digest` correlates the client-side event with the server-side exception Sentry captured via `onRequestError`, which is exactly the join you want when debugging a production report.

Alert config: one rule, "notify on a new issue" + "notify when an issue occurs more than 10 times in an hour", to email. That is the whole alerting story for a 2-person app.

#### A3. No backups. This is the finding to fix first.

**Status: workflow shipped and restore-drilled locally; production secrets/repo still need manual setup** — see `REVIEW.md` P0 item 2 and `README.md` § Backups & restore for the drill results and exact verified commands. One correction to this finding's predicted restore failures: none of them reproduced. `supabase db dump --data-only` (current CLI, 2.114.0) opens the dump with `SET session_replication_role = replica`, which disables every trigger — including `on_auth_user_created` — and all FK-checking triggers for the duration of the load. The "the trigger will fire and seed duplicate households" and "FK ordering fights" concerns below were reasonable to expect a priori but don't hold against the tool as it exists today; verified by an actual dump → wipe → restore of the local stack, not by reading the CLI source.

**Severity: Critical** (ABSENT)

Current recovery story if the DB is corrupted, dropped, or a bad migration destroys expense history: **there is none.** Supabase free tier has no PITR and no downloadable daily backups (those start on Pro). There is no `pg_dump` anywhere in the repo, no scheduled job, no export path in the app. If migration `0005` contains a mistyped `delete from public.expenses`, the data is gone in the same second, permanently, with no undo. The blast radius is a year of two people's financial history — the exact thing the app exists to accumulate.

Note how close the sharp edges already are: `join_household` does `delete from public.households where id = old_household` (`supabase/migrations/0003_households.sql:325`), and `expenses.household_id` cascades (`0003:57`). A logic slip in that one `if not exists` guard deletes an entire household's expenses. That code is live and has run at least once in production.

Fix — scheduled `pg_dump` via GitHub Actions, encrypted, committed to a private backup repo (artifacts expire; a private repo gives you free versioned history and a diffable trail):

```yaml
# .github/workflows/backup.yml
name: Backup
on:
  schedule: [{ cron: '0 3 * * *' }]   # 03:00 UTC daily
  workflow_dispatch:                   # so you can test a restore any time

jobs:
  dump:
    runs-on: ubuntu-latest
    steps:
      - uses: supabase/setup-cli@v1
        with: { version: latest }

      - name: Dump data + roles + schema
        env:
          DB_URL: ${{ secrets.SUPABASE_DB_URL }}   # session-pooler URI, Settings -> Database
        run: |
          supabase db dump --db-url "$DB_URL" -f schema.sql
          supabase db dump --db-url "$DB_URL" --data-only -f data.sql

      - name: Encrypt
        env:
          PASSPHRASE: ${{ secrets.BACKUP_PASSPHRASE }}
        run: |
          tar czf kapa.tar.gz schema.sql data.sql
          gpg --batch --yes --symmetric --cipher-algo AES256 \
              --passphrase "$PASSPHRASE" -o "kapa-$(date -u +%F).tar.gz.gpg" kapa.tar.gz
          rm -f kapa.tar.gz schema.sql data.sql

      - name: Push to private backup repo
        env:
          TOKEN: ${{ secrets.BACKUP_REPO_TOKEN }}
        run: |
          git clone --depth 1 "https://x-access-token:$TOKEN@github.com/<you>/kapa-backups.git" out
          mv kapa-*.tar.gz.gpg out/
          cd out
          git config user.email actions@github.com && git config user.name backup-bot
          git add -A && git commit -m "backup $(date -u +%F)" && git push

      - name: Also keep a 90-day artifact
        uses: actions/upload-artifact@v4
        with: { name: kapa-backup, path: '*.gpg', retention-days: 90 }
```

Add a matching failure notification — a failed backup job is exactly the kind of thing that rots silently. GitHub emails on workflow failure by default for the repo owner; confirm that setting is on.

**An untested backup is not a backup — it is a belief about a backup.** Nothing in this repo suggests a restore has ever been attempted, and restores fail for boring reasons that only surface on the attempt: `auth.users` lives in a schema `pg_dump` may skip depending on flags, so you can restore every expense and still have no users to own them; `--data-only` restores fight foreign keys unless ordered or deferred; the `on_auth_user_created` trigger will fire during a restore of `auth.users` and try to seed duplicate households. Every one of those is discovered in ten minutes of testing and in three panicked hours otherwise. **Do this once, now:** `supabase start` locally, restore the newest dump into it, sign in, and confirm the current month's total matches production. Then write the exact commands into the runbook (A4) and re-test after any migration that changes triggers or constraints.

#### A4. No operational documentation

**Severity: Medium** (ABSENT)

`README.md` is a good *setup* document (66 lines: local dev, env vars, deploy, keepalive, CI, i18n). It contains nothing about operating the thing. Missing: how to roll back a bad deploy, how to apply a migration to prod, how to *revert* one, what to do when the cron fails, how to rotate `CRON_SECRET` or the Supabase keys, how to restore a backup.

This matters more than it looks, because the failures it covers are rare and stressful — precisely when you will not be reasoning clearly, and precisely when the knowledge has decayed. Suggested `RUNBOOK.md`:

```markdown
# Runbook
## Health check          — is the app up, is the DB awake, is the cron green (dashboard links)
## Roll back a deploy    — Vercel → Deployments → previous → Promote to Production (30s, no rebuild)
                           Caveat: this does NOT roll back a migration. See below.
## Apply a migration     — dump first, apply, run smoke check, verify current-month total
## Revert a migration    — every migration needs a hand-written down; if none exists, restore
## Restore from backup   — exact commands, last tested on <date>
## Cron / keepalive fails— check CRON_SECRET, hit route manually, check Supabase not paused
## Key rotation          — CRON_SECRET, Supabase publishable key: order of ops, expected downtime
## Locked out (RLS)      — how to inspect policies via SQL editor as service role
```

Keep it to one page. The value is entirely in the exact commands, not the prose.

#### A5. Minimum viable alerting

**Severity: Medium** (ABSENT)

Three free things, maybe twenty minutes total:

1. **Dead-man's-switch on the cron** — healthchecks.io free tier. Create a check with a 1-day period and 1-hour grace; it emails when a ping *doesn't* arrive. Ping it from the keepalive route only on success:

```ts
// src/app/api/keepalive/route.ts, after the successful read
if (process.env.HEALTHCHECK_URL) {
  await fetch(process.env.HEALTHCHECK_URL).catch(() => {});
}
return NextResponse.json({ ok: true });
```

This single change covers three of the six failure modes in A1 at once: paused project, cron misconfiguration, and expired keys all manifest as a missing ping. It is the highest-leverage ten lines in this review.

2. **Uptime ping** — UptimeRobot free (5-min interval) against the public landing page. Catches Vercel-side outages and DNS/domain expiry.

3. **Error rate** — Sentry's alert rules from A2. No separate tool.

Deliberately *not* recommended: dashboards, Grafana, log aggregation, synthetic transaction monitoring, on-call rotation. For two users, "email me when it breaks" is the correct and complete design.

#### A6. Migrations reach production by hand, with no guard and no down path

**Severity: Medium**

Evidence: `supabase/migrations/0001_phase1_init.sql:2` — *"Apply with `supabase db push` or paste into the Supabase SQL editor."* There is no deploy workflow that applies migrations (`.github/workflows/` contains only `ci.yml`), and CI never touches the production project — it runs `supabase start` against an ephemeral local DB (`.github/workflows/ci.yml:33-35`).

What's genuinely good: `npm run test:db` runs pgTAP (`supabase/tests/database/join_household.sql`) against a real Postgres with the full migration chain applied from scratch, on every PR. That is stronger migration testing than most commercial projects have, and it means a migration that fails to *apply* will be caught.

What's missing:
- **Nothing distinguishes "applied to prod" from "not applied."** Two commits in, you will not remember whether `0004` was pushed. `supabase migration list --linked` answers this; it belongs in the runbook.
- **No down migrations exist at all.** Recovery from a bad migration is a restore — which brings us back to A3, and to the ordering rule: **dump immediately before every prod migration.** For this project scale, "dump first" is a better investment than writing down-migrations, most of which are wrong anyway when they involve dropped columns (`0003:120,126,137-138` drop four columns irreversibly).
- **The migrations chain is tested but not idempotent-verified against prod state.** `0003` is thoughtfully written with `if not exists` guards, but it also has a `do $$` backfill loop and column drops. Re-running it against a partially-migrated prod is unpredictable.

Minimum guard, as a runbook step rather than automation: dump → `supabase migration list --linked` → `supabase db push` → run a smoke query asserting a known-good invariant (`select count(*) from expenses` before and after; the number must not go *down* unless you intended it to). That last check is the one that catches the RLS/cascade disasters.

---

### Part B — Data Lifecycle & Privacy

#### B1. Deleting a user deletes their expenses out of the shared household — confirmed

**Status: fixed** — `supabase/migrations/0007_expense_attribution.sql` applies the migration below verbatim (constraint-first ordering), plus the `delete_account()` RPC also below. `getHouseholdMembers` (`src/lib/queries/household.ts:40`) didn't need a UI change for the null case — it only ever lists *current* `household_members` rows, so a former member's `user_id` is naturally absent from the map; `src/lib/attribution.ts` was updated to render a translated "former member" label when `addedBy` is null, rather than falling through to the generic co-member fallback.

**Severity: Critical**

Confirmed exactly as suspected. `supabase/migrations/0001_phase1_init.sql:45`:

```sql
user_id uuid not null references auth.users (id) on delete cascade,
```

Migration `0003` re-keys everything else to `household_id` and explicitly repurposes `user_id` as attribution — *"`user_id` stays as **added_by** attribution"* (`0003:8`) — but **never alters that FK**. So a column whose meaning changed from "owner" to "who typed it in" kept an ownership-strength cascade. That is the whole bug in one sentence.

Consequence: delete a user from Supabase auth (the only deletion path that exists — the dashboard) and every expense they ever logged vanishes from the *shared* pool. The remaining partner opens the app and their monthly total is lower; their history for the past year is now missing roughly half its rows; the cap math in `src/lib/queries/summary.ts` recomputes cleanly over the survivors and reports a confident, wrong number. No error, no notice, nothing in the UI to suggest anything happened. For a shared budget this is the worst possible failure shape: silent retroactive falsification of a financial record.

The same cascade also takes `profiles` (`0001:18`) and `household_members` (`0003:32`) — those two are correct, since both rows genuinely belong to the departing user. Only `expenses` is miscategorized.

Also worth noting: there is **no in-app deletion path at all** — no route, no action, no settings control (`src/app/settings/page.tsx` offers display name, locale, sign out). So today's deletion is a manual dashboard operation, done without warning about what it destroys.

**Correct semantics: the expense belongs to the household; attribution is a nullable annotation.** Migration `0005`:

```sql
-- Attribution must not own the row. An expense is household data; user_id only
-- records who logged it. Deleting a member must not rewrite shared history.
alter table public.expenses drop constraint expenses_user_id_fkey;
alter table public.expenses alter column user_id drop not null;
alter table public.expenses
  add constraint expenses_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;
```

Then a `delete_account()` RPC that does the anonymization explicitly rather than relying on the cascade, so the intent is legible:

```sql
create or replace function public.delete_account()
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated'; end if;
  update public.expenses set user_id = null where user_id = me;  -- keep the money, drop the name
  delete from public.household_members where user_id = me;
  delete from public.profiles where id = me;
  -- auth.users deletion stays a deliberate admin step.
end $$;
```

UI consequence: attribution rendering (`getHouseholdMembers`, `src/lib/queries/household.ts:40`) must handle `user_id = null` → render "Former member" rather than dropping the row. Small change, and it makes the history honest.

#### B2. There is no way to leave a household — confirmed

**Severity: High** (ABSENT)

Confirmed. `household_members` has exactly one policy — `create policy "members_select" ... for select` (`supabase/migrations/0003_households.sql:202`) — with no insert/update/delete policy, per the deliberate comment *"Mutations flow through the definer trigger / join RPC"* (`0003:200-201`). The only RPC that touches membership is `join_household` (`0003:275`). There is no `leave_household` anywhere in the repo (verified by grep across `src/`, `supabase/`, and the API surface: `src/app/api/household/` contains only `route.ts`, `join/route.ts`, `invite/route.ts`).

Combined with `unique (user_id)` (`0003:36`), a user is in exactly one household forever, and the only exit is to join a different one — which requires someone else to mint an invite. **Two people who separate cannot separate their data.** The remaining move is asking the owner to delete an account in the Supabase dashboard, which triggers B1 and destroys shared history. That is a genuinely bad corner to be in for a couples app.

**The product question — who owns the shared history?** Options:

- **(a) Both keep a full copy.** Leaving forks the household: the leaver gets a new household containing a *copy* of every shared expense, categories, and the cap. Nobody's past months change.
- **(b) Creator/owner keeps it; the leaver starts empty** (with an export first). Cheapest to build. But it means one person's year of history evaporates on a breakup, which is precisely when they'd want it.
- **(c) Split by attribution** — each takes the rows they logged. Symmetric with `join_household`'s stated rule, *"your data comes with you"* (`0003:270`). But it reproduces B1 exactly: both parties' historical monthly totals silently shrink, and both are now wrong.

**Recommend (a), the fork.** The reasoning is that a shared cap is a *household* fact — "we spent 84k in March" is only true over the union — so any split that removes rows makes both copies retroactively false, and option (c) is really just B1 with extra steps. Duplication is the only option that preserves truth on both sides. At this scale the cost is trivial: two people over a year is on the order of a few thousand rows, well inside 500MB. It also dissolves the ownership argument entirely, which is the humane outcome for the situation this feature exists to handle.

Data-model implication: a `leave_household()` SECURITY DEFINER RPC that creates a household (copying `currency`/`timezone`), `insert ... select`s categories with an id remap, copies the cap, `insert ... select`s expenses re-pointed at the new household with remapped `category_id` and `user_id` preserved, then moves the membership. Divergence after the fork is intended, not a bug. Add pgTAP coverage alongside the existing `supabase/tests/database/join_household.sql` — that file is a ready-made template.

#### B3. No data export

**Severity: High** (ABSENT)

No export route, action, or UI exists anywhere. `src/app/settings/page.tsx` offers display name, locale, and sign out.

**Does it matter?** Yes, and not primarily for legal reasons. Three practical ones: it is the *only* user-accessible backup, and given A3 it is currently the only copy of the data outside one free-tier project; it is the precondition for B2 option (b) and for any dignified account closure; and it is the thing that makes the app trustworthy to *keep using* — a financial tool you cannot get your data out of is a tool you are right to hesitate before committing a year to. For a household budget, the data's whole value is its longitudinal continuity.

Minimal version — one route handler, no new dependencies, no client JS:

```ts
// src/app/api/export/route.ts
import { json, requireHousehold } from '@/lib/api/http';
import { listAllExpenses } from '@/lib/queries/expenses';

const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;

export async function GET() {
  const ctx = await requireHousehold();
  if ('response' in ctx) return ctx.response;

  try {
    const rows = await listAllExpenses(ctx.supabase, ctx.householdId);
    const csv = [
      'spent_at,amount_minor,currency,category,note,added_by',
      ...rows.map((r) =>
        [r.spentAt, r.amountMinor, r.currency, esc(r.categoryName ?? ''), esc(r.note ?? ''), esc(r.addedByName ?? '')].join(',')
      ),
    ].join('\n');

    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="kapa-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error('GET /api/export failed', error);
    return json({ error: 'Export failed' }, { status: 500 });
  }
}
```

Plus a plain `<a href="/api/export" download>` in `src/app/settings/page.tsx`. Amounts stay in minor units to avoid float corruption; document that in a header comment or a `README` line. Roughly an hour of work, and it retires most of B5 as a side effect.

#### B4. Retention & PII

**Severity: Low–Medium**

What's stored: email addresses in `auth.users` and, if migration `0002` was applied, plaintext in `public.allowed_emails` (`0002:16-18`); display names in `profiles.display_name` (`0001:19`); locale (`0004`); and the complete financial history — every amount, note, timestamp, and category for every expense, indefinitely. The free-text `expenses.note` field is the most sensitive column in the database and is entirely unconstrained: people write things in expense notes ("therapy", "lawyer", a person's name) that they would not write anywhere else.

**Retention policy: none exists.** Nothing is ever deleted or aged out. For a personal budget tracker that is arguably the correct default — the value *is* the long history — but it should be a stated choice rather than an accident, one line in the README: "Kapa keeps all expense history indefinitely; there is no automatic deletion."

**Is anything logged that shouldn't be?** Mostly no, and this is done well. The logging convention is `console.error('<route> failed', error)` (`src/app/api/household/route.ts:24`, `invite/route.ts:13`, `join/route.ts:32`, `src/lib/api/http.ts:80`) — a context string plus the error object, never the request body. `src/lib/api/http.ts:81-84` deliberately returns a generic message so raw Postgres errors don't reach the client, and the comment says so. Two caveats once Sentry lands:

- Postgres error objects can carry row content in `detail`/`message` (e.g. a unique-violation echoing the offending values). Set `beforeSend` to strip `detail`, and enable Sentry's data scrubbing.
- Do **not** enable Sentry `sendDefaultPii: true` (the wizard may suggest it). It attaches user emails and IPs to every event. `user.id` alone is sufficient to debug a 2-person app.
- `src/app/error.tsx:21` and `global-error.tsx:17` `console.error(error)` client-side, which is fine — production messages are redacted by React and the code correctly keys off `digest` instead (`error.tsx:22-24`).

#### B5. GDPR-shaped obligations — proportionate view

**Severity: Low** (as a private project) / **High** (if it ever goes public)

Non-commercial personal use by two people falls under the household exemption; full compliance is genuinely not the bar today, and building a consent framework for this would be absurd. Stated plainly, of the three rights that matter:

- **Access** — un-servable. No export, no "download my data" (B3).
- **Erasure** — un-servable *and actively harmful* if attempted: the only deletion mechanism destroys a third party's records (B1).
- **Portability** — un-servable. Same gap as access; CSV satisfies "structured, commonly used, machine-readable."

The minimum credible response if this ever went public or commercial: ship B3 (satisfies access + portability in one route), ship B1's `delete_account()` (makes erasure safe and non-destructive to co-members), ship B2's leave path, add a short privacy note saying what is stored and for how long, and confirm the Supabase region (EU if the users are EU). That's the list — four features you should build anyway for product reasons, plus one paragraph of prose. Note separately that Vercel Hobby prohibits commercial use, so "going commercial" is a Pro-plan conversation regardless.

#### B6. Household merge silently corrupts history — a data-lifecycle problem

**Severity: High**

Three distinct losses happen inside `join_household` (`supabase/migrations/0003_households.sql:275-330`), all silent, all irreversible:

1. **Currency.** The RPC moves the joiner's expenses (`0003:307-315`) but never touches `expenses.currency`. If the joiner's household was EUR and the target is RSD, those rows arrive stamped EUR. `src/lib/queries/summary.ts:66` then routes anything not matching `households.currency` into the `otherCurrencies` bucket — so the migrated expenses **drop out of cap math entirely** and appear only as a secondary line. The user's imported history quietly stops counting.
2. **Categories.** Remapping is by *name match* (`0003:309-314`); anything unmatched becomes `category_id = NULL`. The source categories are then destroyed by the household delete cascade at `0003:325`, so the original category name is unrecoverable. "Groceries" survives; "Vet" becomes uncategorized forever.
3. **Cap.** The joiner's `budget_settings` row cascades away with the old household (same line). The comment acknowledges it — *"I adopt the target's cap"* — which is a reasonable rule, but it means historical months are now evaluated against a cap that was never in force at the time.

The migration's own comment calls the category remap *"the one v1 rough edge"* (`0003:305-306`) — the currency issue is the same class of problem and is not acknowledged anywhere.

Framed as data lifecycle rather than a bug: **a merge is a one-way, unbackupable, unaudited transformation of a year of financial records, and the user is shown no diff and given no confirmation.** They tap "Join" expecting to share a budget; they get a silently rewritten history. Combined with A3 (no backups), there is no way to undo it or even to see what changed.

What should happen on merge, in priority order:

- **Refuse the merge outright when currencies differ**, with a clear message. `join_household` should `raise exception 'Currency mismatch'` when the two households' `currency` values disagree. There is no FX conversion in v1 (PLAN §7.4) and no honest way to fake one; blocking is the only correct behavior. This is a three-line change and closes the worst of the three.
- **Preserve unmatched category names** rather than nulling: create the missing categories in the target household instead of dropping to NULL. `insert into categories (household_id, name, color, sort_order) select ... where not exists (...)` before the remap, then match all rows. Strictly better and barely more code.
- **Snapshot before merging.** Even at personal scale, a merge should be preceded by an automatic dump (A3's `workflow_dispatch` makes this a one-click prerequisite in the runbook).
- **Show the user what will happen** — "12 categories will merge into 8; 4 new ones will be created; 340 expenses will move" — before the irreversible step.

---

### What's done well

- **RLS is genuinely well-designed.** The `SECURITY DEFINER` helper functions (`0003:146-185`) solve the policy-recursion problem correctly, and the comment explaining *why* (`0003:141-144`) is exactly the kind of note that saves a future reader an hour.
- **Auth in the DAL, not middleware.** `src/lib/auth/dal.ts` follows current Next.js guidance, and the header comment says why `proxy.ts` isn't the place. `verifySession` is `cache()`-wrapped, and `getClaims()` over `getUser()` is the right call with an explanation of the fallback.
- **Route handlers log consistently and don't leak.** `src/lib/api/http.ts:80-86` returns a generic message while logging the real error; `join/route.ts:12-15` carefully distinguishes known user-facing RPC exceptions from genuine failures rather than flattening everything into a 400.
- **CI is real.** `format:check`, `lint`, `typecheck`, unit tests, **pgTAP against a live Postgres**, and a production build — on every PR. Migration-level testing is rare at any scale.
- **Money as integer minor units**, currency stamped server-side from the household and never trusted from the client (`src/lib/mutations/expenses.ts:1-3, 28`).
- **The keepalive cron fails closed** and the README is honest about the `CRON_SECRET` dependency (`README.md:36-37`).
- **Error boundaries already emit `digest`**, which is precisely the hook needed to correlate with server logs — the plumbing for A2 is half-built.

### Open product questions for the owner

1. **On separation, who keeps the shared history?** (B2) Recommended: both, via a fork. Needs your call before `leave_household` can be built.
2. **Should attribution survive a departed member** as "Former member", or should their expenses become anonymous household rows? (B1)
3. **Is multi-currency a real goal, or is RSD-only permanent?** If permanent, B6 simplifies to a hard constraint. If real, the cap needs a currency model, not a filter.
4. **Retention: keep everything forever?** (B4) Probably yes — but say so in writing.
5. **Should a merge be reversible?** If yes, it needs an audit table recording pre-merge household/category/currency per row. If no (recommended for v1), it needs a confirmation screen and a pre-merge dump.
6. **Is this ever going public/commercial?** The answer changes B5's severity and forces the Vercel Pro conversation. If the answer is "no, ever", say so in the README so future-you doesn't re-litigate it.
