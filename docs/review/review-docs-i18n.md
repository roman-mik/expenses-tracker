## Documentation & i18n Extensibility

**Overall assessment.** Documentation for this project is well above the norm for a one-person app: `PLAN.md` is a genuinely good artifact, migration headers explain *why*, and several modules (`kapa-math.ts`, `auth/dal.ts`, `queries/household.ts`) carry high-value why-comments. The gaps are narrow and specific: (a) the README cannot actually get you from clone to a working local stack — it never mentions `supabase start`, the migrations, `npm run gen:types`, or the dashboard-side auth config, even though CI depends on all of them; (b) `PLAN.md` is now doing plan + changelog + architecture at 23KB and should shed two of those roles; (c) roughly six load-bearing decisions exist only as outcomes, and a future contributor (or an LLM) would plausibly "helpfully" undo two of them. On i18n, the architecture is sound and the deliberate exclusions are mostly well-reasoned, with two real leaks: `lib/attribution.ts` returns English display strings from domain code, and `/api/*` English error text is toasted verbatim into a Russian UI via `HouseholdPanel`. Adding Serbian is cheap for `sr` but the current single-string locale model does *not* cleanly accommodate `sr-Cyrl`/`sr-Latn` script variants — one narrow assumption in `request.ts` is the blocker. Nothing here is High severity.

---

### Part A — Documentation & Decision Records

#### README cannot take you from clone to a working local stack
**Severity: Medium** (the highest-impact finding in this review)

`README.md:9-13` gives `npm install` → copy env → `npm run dev`. Follow that literally and you get a landing page and nothing else. Everything needed for a real local environment is missing or implied:

- **No `supabase start`.** The repo has `supabase/config.toml`, four migrations, and `npm run test:db` (`package.json:14`), and CI explicitly runs `supabase start` / `supabase stop` (`.github/workflows/ci.yml:29-31`). The README never mentions the Supabase CLI, that it's a prerequisite, or that a local stack exists at all.
- **No migration step.** `supabase/migrations/0001_phase1_init.sql:2` says "Apply with `supabase db push` or paste into the Supabase SQL editor" — that instruction lives only inside the SQL file. A newcomer reading the README applies nothing.
- **No `npm run gen:types`.** `package.json:15` defines it against `--local`, and `src/lib/supabase/database.types.ts` is checked in; nothing tells you when to re-run it after a migration.
- **`0002_optional_allowlist.sql` is optional and gated on a dashboard toggle** (`supabase/migrations/0002_optional_allowlist.sql:3-6`: Authentication → "Allow new users to sign up" = OFF). This is out-of-repo config that determines whether you can sign in at all. The README never says how to create your first user (the answer, per `0001_phase1_init.sql:97-98`, is: create it manually in the dashboard).
- **No redirect URLs.** `supabase/config.toml:159,163` sets `site_url`/`additional_redirect_urls` for local; the hosted project needs the equivalent set by hand for the Vercel URL. `README.md:25-31`'s deploy steps skip it.
- **Test commands absent.** `npm test`, `npm run test:db`, `npm run typecheck`, `format:check` are described only under "CI" (`README.md:39-43`) as things CI does, not as things *you* run.

Fix: add a "Local database" section between install and dev:

```bash
npm install
cp .env.local.example .env.local
supabase start                 # local Postgres+Auth; prints the URL + publishable key
supabase db push               # applies supabase/migrations/*
npm run gen:types              # regenerate src/lib/supabase/database.types.ts
npm run dev
```

…plus three lines: "create your first user in Supabase Studio → Authentication → Users (public sign-up is deliberately off)", "if you applied `0002`, insert your email into `allowed_emails` first", and a "Checks" section listing `lint / typecheck / test / test:db / format:check`. Also note `.env.local.example` omits `CRON_SECRET`, which the README table (`README.md:21`) documents — add it as a commented line so the file and the table agree.

#### PLAN.md is three documents in one trench coat
**Severity: Low**

`PLAN.md` is 23KB and currently serves as: an architecture reference (§1 derived-value formulas, §3 data model, §4 API surface + RLS notes), a changelog (§5 phase checklists, including per-branch Phase 6 detail at `PLAN.md:216-239`), and a plan (§5.1 backlog, §7 resolved questions, §8 next step). The architecture content is the part people will read most and the part buried deepest; the changelog content is the part that only grows.

It is also already drifting from the code in one place: `0001_phase1_init.sql:6-10` describes currency/timezone as living on `profiles`, which `0003_households.sql` superseded — `PLAN.md:96` records the correction but the migration header does not. That's the normal failure mode of a single growing doc.

Recommendation — proportionate to a one-person project, three files, no process:

| File | Contains | Source |
|---|---|---|
| `PLAN.md` (shrinks to ~6KB) | Status, current phase, backlog + open questions, next step | §0, §5 (checkboxes only, one line per phase), §5.1, §8 |
| `docs/ARCHITECTURE.md` | Derived-value formulas, data model, API surface + dual-path note, RLS model, free-tier limits | §1, §3, §4, §6 |
| `docs/decisions/` | The *why* behind the above (below) | §7 + the unwritten ones |

Drop the per-branch Phase 6/7 detail entirely — that's what git log is for. Do **not** add a CHANGELOG.md; a solo project with tidy commits doesn't need one.

#### Six decisions recorded as outcomes, not reasoning
**Severity: Medium**

`PLAN.md §7` ("Open questions — resolved") is the right instinct but records verdicts without rationale, and the most consequential decisions aren't even in §7. Judging recoverability from the repo:

| Decision | Recorded at | Is the WHY recoverable? |
|---|---|---|
| Household as tenant boundary | `PLAN.md:73`, `0003_households.sql:3-4` | **Yes** — the migration header states "a solo user is just a household of one, so solo and shared share one code path". Best-documented decision in the repo. |
| `bigint` minor units | `PLAN.md:17`, `0001_phase1_init.sql:5` | **Partly** — "avoid floating-point errors" is there; *why RSD has exponent 0 and what happens if EUR is added* is implied only by `CURRENCY_EXPONENT`. |
| Per-household timezone | `PLAN.md:281` | **Weakly** — states the outcome and that it's not UI-editable. Why per-household rather than per-user (a couple in two timezones) is unargued. |
| **Server Actions + REST duality** | `PLAN.md:153` | **Yes, but fragile** — the paragraph is good ("maintained in parallel as the contract for the future Expo app"). It lives mid-document in a doc slated to grow. This is the #1 candidate for someone deleting `/api/*` as dead code, since only `HouseholdPanel` calls it. |
| **Locale on `profiles`, not household** | `PLAN.md:243`, `0004_profile_locale.sql:1-3` | **Yes** — the migration header nails it ("locale is a personal preference, not something a shared cap needs to agree on"). |
| **No `[locale]` URL segment** | `src/i18n/routing.ts:1-5`, `request.ts:5-11` | **Partly** — the code comments say *what*, and `request.ts:9-10` gives one real reason (keeps `getRequestConfig` free of a Supabase call). The bigger reason (private authed app, no SEO need) is nowhere. |
| **email+password over magic link** | commit f2da965, `PLAN.md:279` | **No.** Only "f2da965 switched off magic-link". The reason is unrecoverable without reading the commit — and the diff shows the change, not the motivation. Highest-risk gap. |
| **RSD-only / no FX** | `PLAN.md:282`, `queries/summary.ts` | **Partly** — the "non-matching currencies surface separately, no conversion" behaviour is commented at `src/lib/date.ts:20-23`; the product reason isn't. |

**Recommended practice.** One folder, `docs/decisions/`, one file per decision named `NNNN-slug.md`, five lines, no tooling, no numbering ceremony, written only when a decision would otherwise look arbitrary:

```markdown
# 0007 — Email + password, not magic link

**Date:** 2026-08-15 · **Status:** accepted
**Context:** Sign-up is invite-only; there is no public registration page.
**Decision:** Supabase email+password auth; magic-link flow removed (f2da965).
**Because:** <the actual reason — e.g. magic links break in the installed PWA's
  webview / the link opens in the wrong browser / two-user app, no password-reset burden>.
**Revisit if:** the user base grows past the household of two, or PWA link handling changes.
```

The `Revisit if` line is what stops a future contributor undoing it.

**Backfill these six, in priority order:**
1. Email+password over magic link *(rationale currently unrecoverable)*.
2. Server Actions + REST duality *(most likely to be "cleaned up" by a contributor or an LLM)*.
3. No `[locale]` URL segment *(a contributor familiar with next-intl will assume this is an oversight and propose `[locale]` routing)*.
4. Currency stays `sr-RS` while UI locale is per-user *(looks like a bug — see Part B)*.
5. RSD-only / no FX in v1 *(the schema has `currency` columns everywhere, inviting someone to "finish" multi-currency)*.
6. Per-household timezone, not per-user.

Households-as-tenant and bigint-minor-units are already adequately explained in their migration headers — don't duplicate them, just link from `ARCHITECTURE.md`.

#### Comment quality is genuinely high but unevenly distributed
**Severity: Low**

Measuring comment lines per file across `src/lib` (excluding tests and generated types), the distribution is bimodal. Dense and excellent: `kapa-math.ts` (52 comment lines / 202), `auth/dal.ts` (26/53), `queries/household.ts` (19/84), `date.ts` (17/73), `format.ts` (12/27), `api/http.ts` (16/82). Thin: `mappers.ts` (5/79), `queries/summary.ts` (9/110 — the most logic-dense query in the app), `mutations/expenses.ts` (17/101), `attribution.ts` (1/11), `supabase/client.ts` (0/9).

The praised comments are real and the pattern is consistent in *hard* files — the author comments where it hurt. The gap is that `queries/summary.ts` is the single most-consequential read path (it backs the whole home screen and `GET /api/summary`) and has the lowest comment-to-logic ratio of the non-trivial files; the currency-split behaviour it implements is documented in `date.ts:20-23` (a *different* file) rather than at its source. Fix: one header comment on `getSummary` covering the active-currency split and why non-matching rows are excluded rather than converted, and one on `mappers.ts` stating the snake_case↔camelCase boundary contract.

`src/lib/attribution.ts:9-10` is the one place where thin commenting hides an actual defect — see Part B.

#### Schema is well-commented; the missing piece is a one-page overview
**Severity: Low**

Migrations are better commented than most production repos: `0001_phase1_init.sql:1-11` lists design notes, `0002_optional_allowlist.sql:1-14` explains that it is optional, what the *primary* gate is, and how to use it; `0003_households.sql:1-8` explains the re-keying; `0004_profile_locale.sql:1-3` justifies per-user locale. Sectioned with rule comments throughout. `0001`'s header is stale post-`0003` (see above).

What's missing is any single place that answers "what tables exist and which is the tenant key" — that lives only in `PLAN.md:75-132`. For four migrations, the minimum worth writing is exactly what already exists: move the `PLAN.md §3` block into `docs/ARCHITECTURE.md`, add a 6-line RLS paragraph (`is_household_member` / `same_household` are `SECURITY DEFINER` to avoid policy recursion on `household_members` — currently `PLAN.md:171`), and add a one-line stale-header fix to `0001`. No ER diagram tool, no schema-doc generator.

#### AGENTS.md is entirely machine-generated; CLAUDE.md carries the project's own content
**Severity: Low**

`AGENTS.md` (678 bytes) is 100% the `next dev`-generated block — "This is NOT the Next.js you know", pointing at `node_modules/next/dist/docs/`, plus the self-describing note that it's re-added by the dev server. The project has added **nothing** of its own. It is still useful (the Next 16 pin at `package.json` really does diverge from model priors), but it's borrowed, not authored.

`CLAUDE.md` is the project's actual contribution: it `@AGENTS.md`-includes the above and adds the graphify workflow (query/path/explain before grep, `graphify update .` after changes). That's genuinely useful and correctly scoped.

Worth adding to `CLAUDE.md` (not `AGENTS.md`, which gets overwritten) — three lines that would prevent the most likely AI-assisted mistakes in this repo: (1) `/api/*` is not dead code, it's the Expo contract; (2) locale is cookie-based by design, do not add a `[locale]` segment; (3) money is integer minor units end-to-end, never floats. Each of these is a decision an eager assistant would otherwise "fix".

---

### Part B — i18n Extensibility

#### Adding Serbian: ~2–4 hours for `sr`, but script variants break the model
**Severity: Medium** (as a design limit; Low as a bug today)

For plain `sr`, the README's own three-step recipe (`README.md:51-58`) is accurate and complete:
1. `src/i18n/routing.ts:7` — add `'sr'` to `locales`.
2. New migration relaxing the `profiles.locale` check constraint (`supabase/migrations/0004_profile_locale.sql`).
3. `messages/sr.json` — ~200 keys, including two ICU plural blocks (`messages/en.json:39`, `:58`) that need Serbian's `one/few/other` categories.
4. `Settings.localeSr` in all three message files + `localeLabel` in `src/components/settings/LocaleForm.tsx:22-25`.

Nothing else is hardcoded — `layout.tsx:49` passes `lang={locale}` dynamically, `history/page.tsx:62` passes `getLocale()` into `dayLabel`, and `request.ts:31` imports `messages/${locale}.json` by template. Realistic cost: **2–4 hours**, dominated by translation quality, not code.

**Script variants are the real problem.** `sr-Cyrl` / `sr-Latn` is not a niche concern in Serbia — it's the default expectation. The blocker is one line:

```ts
// src/i18n/request.ts:20-24
const preferred = headerStore.get('accept-language')?.split(',')[0]?.split('-')[0]?.trim();
```

`?.split('-')[0]` truncates every tag to its **primary subtag**, so `sr-Latn-RS` → `sr` and `sr-Cyrl` → `sr`. That line is the only 2-letter-code assumption in the codebase, and it silently makes script variants unreachable via `Accept-Language`.

Everything else is subtag-agnostic: `Locale` is `(typeof locales)[number]` (`routing.ts:9`), `isLocale` is a membership test (`routing.ts:13-17`), the cookie stores an arbitrary string, `profiles.locale` is `text` with a check constraint, and the message import is a template literal. So `locales = ['en','ru','sr-Cyrl','sr-Latn']` would work today **except** for language-only negotiation.

Fix (~30 min): replace the truncating parse with a proper negotiation that tries the full tag first, then progressively shorter prefixes, then a configured per-language default script:

```ts
const tags = headerStore.get('accept-language')?.split(',').map(t => t.split(';')[0].trim()) ?? [];
for (const tag of tags) {
  if (isLocale(tag)) return tag;                       // sr-Latn-RS → exact
  const base = tag.split('-')[0];
  if (isLocale(base)) return base;                     // ru-RU → ru
  const fallback = SCRIPT_DEFAULTS[base];              // sr → sr-Latn
  if (fallback) return fallback;
}
```
Also drop `q=` weights properly (the current `.split(',')[0]` takes the first tag, not the highest-weighted one). Total Serbian-with-scripts estimate: **1 day**, of which ~1 hour is code.

#### The locale/currency split is coherent, but produces a genuinely mixed presentation
**Severity: Low**

The design is deliberate and defensible (`PLAN.md:243`): UI language is a personal preference; the currency and its formatting belong to the shared household cap. Splitting them is *right* — a Russian-speaking member of a Belgrade household should not see RSD rendered with Russian grouping while their partner sees Serbian grouping for the same number.

But the implementation is not a clean two-way split; it's a three-way one, and only two thirds were chosen on purpose:

| Surface | Locale used | Where |
|---|---|---|
| UI strings | user's (`en`/`ru`) | next-intl |
| Money | **always `sr-RS`** | `src/lib/format.ts:22` — hardcoded |
| Day labels in History | **user's locale** | `src/app/history/page.tsx:62` → `src/lib/date.ts:56-72` |
| Date grouping key | always `en-CA` | `src/lib/date.ts:10` — correct, it's an internal ISO key, and the comment says so |

So a Russian-UI user sees: Russian chrome, Russian weekday names ("пн, 15 авг"), and amounts formatted `65.000` (Serbian dot-grouping). Russian conventionally uses a space as the thousands separator, so the numbers will read as slightly foreign — which is arguably the *intended* effect for a Serbian-denominated cap, and consistent with `formatMoney`'s doc comment (`format.ts:9-13`) which explicitly says "the Serbian-formatted strings the design uses".

The mixed date-vs-money behaviour is coherent under one reading (dates are personal, money is household) but that reading is written down nowhere — `PLAN.md:243` mentions only `format.ts`, not `date.ts`. Fix: one sentence in the ADR for decision #4 above, plus a comment at `format.ts:22` saying `sr-RS` is a *household* property that deliberately does not follow the UI locale, and will need to become `households.locale` if non-RSD currencies ship. Right now `sr-RS` is a string literal with no marker that it's a policy rather than a default.

#### `lib/attribution.ts` returns English display strings from domain code
**Severity: Medium** — the one confirmed user-visible leak, and an architectural mistake, not a missed key

```ts
// src/lib/attribution.ts:9-10
if (addedBy === currentUserId) return 'you';
return member?.displayName?.trim() || 'partner';
```

Rendered verbatim at `src/components/home/TodayList.tsx:28` and `src/components/home/HistoryList.tsx:65`. A Russian-UI user sees "you" and "partner" in English on the home screen and history — the two most-viewed surfaces in the app. This is not on `PLAN.md:244`'s deliberate-exclusion list, so it's an oversight rather than a choice.

The architectural point matters more than the two strings: `src/lib/date.ts:56-72` gets this exactly right — `dayLabel` takes `labels: { today, yesterday }` as a parameter and the doc comment explicitly says "this module stays framework-agnostic — no next-intl import". `attribution.ts` is the same shape of problem solved the wrong way. Fix it the same way:

```ts
export function attributionLabel(
  addedBy: string, currentUserId: string,
  member: HouseholdMember | undefined,
  labels: { you: string; partner: string }
): string
```
with `Common.you` / `Common.partner` keys, resolved in the two components. ~20 minutes. Then add a lint-adjacent guard: a grep-based test asserting no bare quoted English sentence-case strings are returned from `src/lib/**` (see the structural-safety section).

#### `/api/*` English errors reach the Russian UI through HouseholdPanel
**Severity: Low-Medium**

`PLAN.md:244` justifies leaving `/api/*` error strings in English as "the future Expo client's own concern, per §4/§5". That justification is sound *in general* — an API contract shouldn't be localized server-side — but it has a hole the plan itself documents at `PLAN.md:153`: `HouseholdPanel` is a web caller of `/api/*`. And it surfaces the raw body:

```ts
// src/components/household/HouseholdPanel.tsx:34
if (!res.ok) throw new Error(body?.error ?? t('couldNotCreateCode'));
// :38
toast.error(e instanceof Error ? e.message : t('somethingWentWrong'));
// :70
: (body?.error ?? t('invalidCode'))
```

`body?.error` wins over the translated fallback whenever the server sends one — which it always does (`src/app/api/household/join/route.ts:33`: `'Could not join that household'`). So the Russian-UI failure path shows an English toast. Fix without touching the API contract: have `HouseholdPanel` ignore `body.error` for display and switch on `res.status` (or a machine-readable `body.code`) to pick a translated message; keep `body.error` for `console.error` only. ~30 min, and it *improves* the API contract by pushing it toward codes over prose.

Assessing the other three deliberate exclusions:
- **`global-error.tsx`** — justification **holds**. It replaces the root layout including the provider (`src/app/global-error.tsx:6-8,22` renders its own `<html lang="en">`), so `useTranslations` genuinely isn't available. Worth noting the hardcoded `lang="en"` is then *correct*, not a bug.
- **`manifest.ts`** — justification **holds** for a single-manifest build; `src/app/manifest.ts:11-13` is the install-prompt name only, seen once. Revisit only if the PWA install experience becomes a priority.
- **zod messages in `validation.ts`** — justification **holds today**: the messages are terse and non-user-facing (`validation.ts:12` `"month must be 'YYYY-MM'"`, `:41` `'No changes given.'`), and actions map failures to their own translated copy (`src/app/actions/profile.ts:26` returns `t('checkName')`, never the zod message). The risk is drift: nothing *enforces* that an action never forwards `parsed.error`. Add a one-line comment at the top of `validation.ts` stating that zod messages are developer-facing and must never be returned to a client.

#### `messages.test.ts` guards less than it appears to
**Severity: Low**

`src/test/messages.test.ts` checks two things: identical key-path sets (`:26-30`) and no empty values (`:32-35`). Key parity is the most valuable single check and it's correctly recursive, so nesting drift is implicitly covered (a moved key changes its path). What it does **not** catch:

1. **Interpolation-param drift** — `en.json` and `ru.json` currently agree (`{amount} {count} {digest} {pct} {remaining} {safeDaily} {spentPct}`), but nothing enforces it. A translator dropping `{amount}` from `RecoveryPlan.evenOutOffer` ships a message missing the number, and next-intl won't error at build time.
2. **Missing plural categories** — the two plural blocks (`messages/en.json:39`, `:58`) are hand-written per locale. `ru.json:39` correctly supplies `one/few/many/other`; the *next* Russian plural someone adds may not. Serbian will need `one/few/other`. Nothing checks a locale's CLDR-required set is present.
3. **Malformed ICU** — an unbalanced brace in a translation is a runtime error on the page that uses it, caught only if that page has a component test.
4. **Unused keys / missing keys** — no check that every key is referenced from `src/`, nor that every `t('...')` call has a key. Dead keys accumulate; a typo'd `t('foo')` fails at runtime.
5. **`en` as the fallback authority** — the test compares `ru` to `en` symmetrically (`expect(ruKeys).toEqual(enKeys)`), which is right, but with a third locale the pairwise structure needs generalizing to "every locale vs `en`".

Concrete additions to `messages.test.ts`, all cheap and dependency-free except #3:
```ts
// 1. param parity — extract /\{(\w+)[,}]/g per key path, compare sets per locale vs en
// 2. plural categories — for each `{x, plural, ...}` block, assert the branch names
//    are a superset of Intl.PluralRules(locale).resolvedOptions().pluralCategories
// 3. ICU validity — parse each message with @formatjs/icu-messageformat-parser (devDep)
//    inside expect(() => parse(msg)).not.toThrow()
// 4. unused keys — grep src/ for each top-level namespace; warn-list rather than fail
// 5. loop over `locales` from src/i18n/routing.ts instead of importing en/ru by hand,
//    so a new locale is covered the moment it's registered
```
Item 5 is the one to do first — it's five lines and makes every other check automatically cover Serbian.

#### Locale resolution is correct; cookie and DB can diverge, and the cookie wins
**Severity: Low**

The resolution chain (`src/i18n/request.ts:14-28`) is cookie → `Accept-Language` → `en`, all read server-side inside `getRequestConfig`. **No hydration-mismatch risk** — the locale is resolved during SSR and `layout.tsx:49` stamps `lang={locale}` on the server; nothing reads `navigator.language` on the client. Good.

Cookie attributes (`src/app/actions/profile.ts:62-66` and `src/app/auth/callback/route.ts:36-40`) are identical and reasonable: `path: '/'`, `maxAge` one year, `sameSite: 'lax'`. Two small gaps: no `secure` flag (harmless for a non-sensitive preference, but free to add and it's a habit worth keeping consistent with the auth cookies), and the cookie is never cleared on sign-out (`src/app/auth/signout/route.ts`) — so on a shared device, user B inherits user A's language until B's next sign-in writes over it. That's a cosmetic privacy nit, not a leak.

**Cookie vs. `profiles.locale`:** they can absolutely diverge, and the design handles it deliberately rather than accidentally. `setLocale` writes both (`profile.ts:62`, plus the DB via `updateLocale`), and `syncLocaleCookie()` (`profile.ts:88`) re-seeds the cookie from the profile at sign-in — that's the reconciliation point. Between sign-ins **the cookie wins unconditionally** (`request.ts:16-17` returns before any DB read), which is the right trade (`request.ts:9-10` explains it: no Supabase call per request). The observable consequence: changing your language on device A does **not** update device B until B signs in again. That's a defensible choice for a two-person app but is documented nowhere user-facing — `Settings.languageHelp` should say so in one clause, or the settings page should re-sync on load.

**No `[locale]` URL segment** was the right call here. The app is fully authed (there is no public sign-up per `PLAN.md:279`), so there are no SEO variants to want and no anonymous shareable links to localize. The costs of `[locale]` routing — every `<Link>` and `redirect()` becoming locale-aware, doubled route types, middleware — buy nothing for a private household app. The one real loss is "send my partner a link in my language", which is meaningless when the recipient has their own `profiles.locale`. Worth an ADR precisely because it looks like an omission.

#### RTL: no structural blocker, and very little to undo
**Severity: Low**

Only **6 directional utility usages** across all of `src/` (`ml-*`/`mr-*`/`pl-*`/`pr-*`/`left-*`/`right-*`/`text-left`/`text-right`) — the codebase is overwhelmingly flexbox + `gap`, which is direction-agnostic. Tailwind v4 supports logical properties (`ms-*`/`me-*`/`ps-*`/`pe-*`/`text-start`/`text-end`) natively, so converting those six is a mechanical ~15-minute change.

The two things that would need actual thought: `layout.tsx:47-50` sets `lang` but never `dir`, so an RTL locale needs `dir={rtlLocales.has(locale) ? 'rtl' : 'ltr'}` (trivial); and `src/components/home/DailySpendChart.tsx` is a hand-rolled bar chart whose day-ordering is visual — bars would need to run right-to-left, and its safe-daily reference line label repositioned. That's maybe an hour. No blocker; just don't let more `ml-`/`pl-` accumulate — a lint rule banning them in favour of logical properties would keep the current good state for free.

---

### What's done well

- **`PLAN.md` §7 "Open questions — resolved"** is a pattern more projects should copy: it keeps decided questions visible instead of letting them silently vanish, which is exactly what stops re-litigation.
- **`PLAN.md:37`** (the `daysLeft` convention) and **`PLAN.md:153`** (the Server-Actions/REST duality, explicitly labelled "as shipped, not as originally imagined") are both the rare kind of documentation that records a *surprise* — and `PLAN.md:203` labels a missing service worker "a deliberate v1 cut, not a gap", which is exactly the sentence a future reader needs.
- **Migration headers carry rationale, not just DDL** — `0002_optional_allowlist.sql:1-14` (optional, what the primary gate actually is, how to apply, and a warning that a `BEFORE INSERT` trigger on `auth.users` can interfere with Supabase flows) and `0004_profile_locale.sql:1-3` (why locale is per-user while currency/timezone are per-household) are both better than most production schemas manage.
- **`src/lib/date.ts:56-72`** is the model for keeping domain code i18n-clean: translated labels are injected as parameters and the doc comment states the constraint explicitly. It's the correct solution to the exact problem `attribution.ts` gets wrong.
- **`src/i18n/routing.ts`** is a real single source of truth — `locales`, `Locale`, `defaultLocale`, and `isLocale` in one 17-line file consumed by the request config, the Server Action, and the auth callback. This is why adding a locale is genuinely a 3-step job.
- **`messages.test.ts` exists at all.** Key-parity enforcement in CI is the highest-value i18n test per line of code, and having it from day one of Phase 7 is why `ru.json` is complete rather than 80% done.
- **`README.md:45-58` "Adding a language"** documents the extension path before anyone asked — and its 3 steps are accurate.
- **CI runs the full gate including `supabase start` + pgTAP** (`.github/workflows/ci.yml:29-31`), with a comment explaining why placeholder env vars are safe at build time. The `typecheck = next typegen && tsc --noEmit` explanation at `README.md:42-43` is exactly the sort of non-obvious tooling detail that saves an hour later.
