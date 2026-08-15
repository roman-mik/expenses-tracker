## Testing Strategy

### Overall assessment

This is a **well-built suite that tests the wrong risk**. The craft is genuinely good: 33 files / 192 tests in ~1.2s, real message strings instead of mocked i18n, dependency injection instead of module mocking, factories, a two-project Vitest config that keeps node and jsdom honest, and CI that actually spins a real Postgres for pgTAP. Comments in the test helpers explain *why*, which is rare.

But the application is a **multi-tenant shared-household expense tracker whose entire security and correctness model is Postgres RLS**, and RLS is executed **zero times** anywhere in the suite. The 192 unit tests run against `src/test/fake-supabase.ts`, an in-memory store that has no concept of a policy — every row seeded is visible to every query. The one pgTAP file that touches a real database sets `request.jwt.claims` but never `set local role authenticated`, so it runs as the BYPASSRLS superuser (`supabase/tests/database/join_household.sql:33-34`) and also proves nothing about isolation. And the same `.eq('household_id', …)` scoping that the fake *does* enforce is precisely what a refactor is most likely to drop — at which point the fake would catch it, but only because the fake is stricter than the code's real safety net, not because the tests model the threat.

Net: the suite is a strong **regression net for pure functions and handler control flow**, and a **near-zero net for tenant isolation, data integrity, and anything that only fails against real Postgres**. The single highest-value work item is not more unit tests — it is one `set local role authenticated` line plus ~10 RLS assertions in pgTAP, which is maybe two hours and converts the security model from "asserted in comments" to "asserted in CI".

Secondary theme: the fake diverges from supabase-js in ways that don't merely under-test but **actively certify wrong behavior as correct** — `fake-supabase.ts:215-219` (upsert matches on any shared field), `:178-182` (`.single()` fabricates a non-PostgREST error shape and silently swallows the >1-row case), `:43-46` (`failNext` doesn't implement the mode key its own comment promises). One test already encodes a live production 500 as expected (`src/app/api/cap/route.test.ts:46-51`). Green here is weaker evidence than it looks.

### Current coverage map

| Layer | Tool | What it actually covers | What it structurally cannot catch |
|---|---|---|---|
| Pure domain math | Vitest node (`kapa-math`, `daily-totals`, `category-breakdown`, `current-month`, `format`) | Arithmetic, DST/timezone month windows, clamping, rounding | Nothing much — this layer is genuinely covered |
| Queries / mutations | Vitest + `fake-supabase.ts` | Filter composition, ordering, mapper round-trip, thrown-error propagation | RLS denial, PostgREST error codes, constraint/trigger/FK violations, `onConflict`, real null-vs-undefined, >1-row `.single()` |
| Route handlers / actions | Vitest + mocked `dal` + fake client | Status codes, Zod 400s, 401 shape, happy-path JSON | Real cookies/session, real auth, real DB errors, revalidation, redirects, whether the route works at all end-to-end |
| Components (5 of 25) | Vitest jsdom + Testing Library + real `en.json` | Interaction → action-call contract, toasts, nav, popover wiring | 20 untested components; a11y beyond what RTL queries incidentally require; visual/layout |
| Server Components / pages | — none — | — | Every async RSC: data fetch, auth redirect, prop wiring into children |
| Database | pgTAP (`join_household.sql`) | 13 solid assertions on join/merge/cascade/no-op semantics | **All RLS** (runs as superuser), all other tables, constraints, triggers, invite generation |
| i18n | `src/test/messages.test.ts` | en/ru key parity, no empty values | Missing/extra ICU params, plural-category errors, raw untranslated strings rendered in UI |
| E2E / a11y / visual | — none — | — | Everything cross-cutting |

---

### 1. `fake-supabase.ts` is not a stand-in, it is a second implementation — and it disagrees with the first

**Severity: High.**

The file's own docstring is honest ("Not a PostgREST reimplementation", `src/test/fake-supabase.ts:10-13`), but it is used as one by 20+ test files, which means every assertion in `src/lib/queries/**` and `src/lib/mutations/**` is really an assertion about *this file's* semantics. Where it diverges, the divergence is silent and green.

**Concrete divergences, worst first:**

**(a) No RLS. At all.** `db.query(table)` (`:61-63`) returns every seeded row that passes the explicit `.eq()` chain. In production, `expenses_select` (`supabase/migrations/0003_households.sql:230`) filters by `public.is_household_member(household_id)` before your `.eq` ever runs. So the fake tests a *strictly more permissive* world than production for reads — and a *strictly more restrictive* one for writes, since the fake happily writes rows RLS would reject with a `42501`/`new row violates row-level security policy` error. **Bug class let through:** any mutation that writes a `household_id`/`user_id` the caller isn't entitled to passes green in tests and throws in production. `createExpense` (`src/lib/mutations/expenses.ts:31-43`) inserts `user_id: userId` — the `expenses_insert` policy demands `user_id = auth.uid()`; nothing in the suite would notice if the wrong id were threaded through, because the fake has no `auth.uid()`.

**(b) `.single()` fabricates a non-PostgREST result.** `:178-182`:
```ts
if (this.singleFlag) {
  return rows.length === 1
    ? { data: rows[0], error: null }
    : { data: null, error: { message: 'Row not found' } };
}
```
Real PostgREST returns `PGRST116` with `message: 'JSON object requested, multiple (or no) rows returned'`, plus `details`, `hint`, `code`. Two consequences: (i) any production code that branches on `error.code === 'PGRST116'` — the idiomatic "not found is fine" check — is untestable here and would be written wrong with confidence; (ii) **the 0-row and >1-row cases are collapsed into one indistinguishable error**, so a query that accidentally matches many rows reads identically to one that matches none. In real PostgREST >1 row is a *hard* error even under `.maybeSingle()`; here `maybeSingle()` (`:183-185`) just returns `rows[0]` and discards the rest — a duplicate-row bug is invisible.

**(c) `upsert` ignores `onConflict` and matches on any shared field.** `:215-219`:
```ts
const existing = store.find((r) =>
  Object.keys(payload).some((k) => r[k] !== undefined && r[k] === payload[k])
);
```
`upsertCap` (`src/lib/mutations/cap.ts:19-32`) passes `{ onConflict: 'household_id' }`, and the fake never reads `_opts`. Because the payload always includes `monthly_cap`, `nudge_enabled`, `nudge_pct` and `updated_at`, **two different households whose caps happen to be equal will collide**: household B's row gets overwritten by household A's upsert and the test still asserts green on the returned row. That is the exact shape of a real cross-tenant data-loss bug, and the fake is engineered to hide it. It also means the suite has never verified that the `budget_settings` unique constraint on `household_id` even exists.

**(d) `failNext` doesn't do what it says.** The `errors` map is documented as `table -> mode -> message` (`:23`) but is keyed by table alone (`:24`, `:44-46`) and consumed at the top of `execute()` before mode dispatch (`:190-191`). So a test can never say "make the *insert* fail but let the preceding *select* succeed" — the first statement to touch the table eats the error. Multi-statement mutations like `createExpense` (which selects `households` then inserts `expenses`) can't have their second-statement failure path tested at all. That path is real: a failed insert after a successful currency lookup.

**(e) Filters are JS `===`, not SQL.** `.eq` (`:101-104`) uses strict equality, so `1 === '1'` is false where Postgres would coerce; `null` compares equal to `null` where SQL `= NULL` is never true (RLS and `.eq('category_id', null)` behave differently in production — PostgREST emits `is.null`). `.gte`/`.lt` (`:109-116`) stringify and compare lexically, which is right for ISO timestamps by luck and wrong for any numeric column. There is no `.or()`, no embedded joins, no `.not`, no `.neq` — fine today, but the docstring's "extend here" invitation means the next person adds a method with these same semantics.

**(f) Insert doesn't apply defaults, constraints, or triggers.** `:199-206` stamps a random `id` and spreads the payload. No `check (amount_minor >= 0)` (`0001_phase1_init.sql:47`), no `check (nudge_pct between 1 and 100)` (`:39`), no `default now()` on timestamps, no FK enforcement on `category_id`, no `handle_new_user` trigger. **Bug class:** an expense inserted with a `category_id` belonging to another household passes green — and this is exactly the merge scenario `join_household` exists to handle.

**Recommendation: both, weighted toward real Postgres.** Do not invest heavily in making the fake faithful — that road ends in reimplementing PostgREST, and a faithful-enough fake is indistinguishable from the real thing at 10x the maintenance. Instead:

1. **Harden the fake cheaply, to fail loudly rather than to be correct.** Three surgical changes:
```ts
// :139 — honour onConflict, and refuse to guess.
upsert(payload: Row, opts?: { onConflict?: string }) {
  this.mode = 'upsert';
  this.payload = payload;
  this.conflictCols = opts?.onConflict?.split(',').map((c) => c.trim());
  if (!this.conflictCols) {
    throw new Error('FakeDb: upsert without onConflict is ambiguous — pass it.');
  }
  return this;
}
// …then in execute():
const existing = store.find((r) =>
  this.conflictCols!.every((k) => r[k] === payload[k])
);

// :177 — PostgREST-shaped errors, and make >1 row a hard failure.
private finish(rows: Row[]): PGResult<unknown> {
  const pgrst116 = (n: number) => ({
    code: 'PGRST116',
    message: 'JSON object requested, multiple (or no) rows returned',
    details: `Results contain ${n} rows`,
    hint: null,
  });
  if (this.singleFlag) {
    return rows.length === 1
      ? { data: rows[0], error: null }
      : { data: null, error: pgrst116(rows.length) };
  }
  if (this.maybeSingleFlag) {
    if (rows.length > 1) return { data: null, error: pgrst116(rows.length) };
    return { data: rows[0] ?? null, error: null };
  }
  return { data: rows, error: null };
}
```
   Plus key `errors` by `${table}:${mode}` so `failNext('expenses', 'insert', msg)` matches its docstring.
2. **Add an optional RLS-simulation hook** so the fake can at least model denial:
```ts
// FakeDb
policies = new Map<string, (row: Row) => boolean>();
asUser(userId: string, householdIds: string[]) { /* set visibility predicate */ }
```
   applied as an implicit first filter on select and as a write-rejection check (`{ data: null, error: { code: '42501', message: 'new row violates row-level security policy' } }`). This is ~30 lines and turns a whole bug class from invisible to caught. It is *not* a substitute for §2/§3 — it is a smoke alarm, not a sprinkler.
3. **Move the trust to real Postgres** (§2 and §3 below). Once integration tests exist, the fake's job shrinks to "fast feedback on filter composition and mapper shape", which is a job it can honestly do.

### 2. The missing middle: nothing exercises a real request against a real database

**Severity: High.**

The pyramid here is an hourglass with the waist pinched shut. Route-handler tests mock `verifySession`/`getHouseholdId` (`src/app/api/cap/route.test.ts:4-10`) and inject a fake client, so they verify *the handler's branching given stipulated auth* — valuable, but they cannot fail if the auth wiring is broken, if the cookie/session plumbing regresses, if RLS denies the query, or if the DB rejects the write. pgTAP verifies SQL in isolation with no application code above it. **No test anywhere runs application code against real Postgres with a real JWT.**

**Quantified risk:** every one of the following would ship green today — the entire tenant-isolation surface, the entire constraint surface, every PostgREST error-shape assumption, `auth/callback/route.ts`, and any Server Component's data path. Roughly, the code paths that a paying user's *data privacy* depends on have **0% executed-against-reality coverage**, while the arithmetic that determines whether a progress bar reads 49% or 50% has near-100%.

**Proposed layer.** CI already runs `supabase start` before `supabase test db`, so the infrastructure cost is *zero additional minutes of container boot* — you are paying for the database and then not using it. Add a third Vitest project:

```ts
// vitest.config.mts — third project
{
  resolve: { alias },
  test: {
    name: 'integration',
    environment: 'node',
    include: ['src/**/*.itest.ts'],
    setupFiles: ['./src/test/setup-integration.ts'],
    fileParallelism: false,   // shared DB
    testTimeout: 20_000,
  },
}
```
Gate it in `package.json` as `"test:integration": "vitest run --project integration"` so the default `npm test` stays at 1.2s, and add one CI step after `supabase start`.

**Seeding and authenticating two users in two households:**
```ts
// src/test/setup-integration.ts
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

/** Creates a confirmed user; handle_new_user() gives them a household-of-one. */
export async function makeUser(tag: string) {
  const email = `${tag}-${crypto.randomUUID()}@example.test`;
  await admin.from('allowed_emails').insert({ email });
  const { data, error } = await admin.auth.admin.createUser({
    email, password: 'password123', email_confirm: true,
  });
  if (error) throw error;

  // A per-user anon client carrying that user's real JWT — RLS applies.
  const client = createClient(URL, process.env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  await client.auth.signInWithPassword({ email, password: 'password123' });

  const { data: m } = await admin
    .from('household_members').select('household_id').eq('user_id', data.user.id).single();

  return { id: data.user.id, email, client, householdId: m!.household_id };
}

export async function destroyUser(u: { id: string; email: string }) {
  await admin.auth.admin.deleteUser(u.id);
  await admin.from('allowed_emails').delete().eq('email', u.email);
}
```
Because every function in `src/lib/queries/**` and `src/lib/mutations/**` already takes the client as its first argument, **the integration tests reuse the production code unchanged** — you pass `alice.client` instead of `fakeSupabase().client`. That injection decision (fake-supabase.ts:6-8) is what makes this cheap; it is the best structural choice in the codebase and it is currently only half-cashed-in.

**The 10 highest-value cases**, in order:

1. `listExpenses(bob.client, alice.householdId)` → `[]`, even though Alice has expenses. (Repeat for `listCategories`, `getCap`/`getBudgetSettings`, `getSummary`, `listMembers` — that is 5 tests, one per table, and it is the whole isolation model.)
2. `updateExpense(bob.client, bob.householdId, aliceExpenseId, …)` → `null`, and Alice's row is byte-identical afterwards.
3. `deleteExpense(bob.client, bob.householdId, aliceExpenseId)` → `false`, row still present.
4. `createExpense(bob.client, alice.householdId, bob.id, …)` → **throws** (RLS `expenses_insert` denies a foreign `household_id`). Today the fake returns success.
5. `upsertCap(bob.client, alice.householdId, {monthlyCap: 1})` → throws; Alice's cap unchanged. This is the direct real-Postgres answer to divergence (c).
6. Invite/join round-trip: `createInvite(alice.client, …)` → `joinHousehold(bob.client, code)` → Bob's queries now see Alice's expenses; Bob's old household is gone; a *third* user still sees nothing.
7. Invite code is not guessable/reusable across tenants: Carol calling `joinHousehold` with a stale code from Bob's deleted household fails.
8. Concurrent edit: two `updateExpense` calls on the same row from two members of the *same* household — assert last-write-wins deterministically and neither throws (documents the model; today it's unspecified).
9. Cascade: delete a category, assert its expenses survive with `category_id = null` (or whatever the FK says) rather than vanishing.
10. Constraint round-trip: `createExpense` with `amount_minor` negative → rejected by the DB check, and the error surfaces as a clean thrown `Error`, not a 500 with a Postgres string leaked to the client.

Add two more if budget allows: a `POST /api/expenses` handler invoked with a real signed-in cookie jar, and `auth/callback/route.ts` exchanging a real code.

### 3. The pgTAP file tests logic as a superuser and therefore tests no security

**Status: fixed** — `tests.login_as`/`tests.logout` helpers added, `join_household.sql` retrofitted, `rls.sql` added (16 assertions, this doc's sketch declared `plan(14)` but wrote 11 — recount landed on 16 once the fixture and sanity checks were filled in). Two implementation notes for whoever touches this next: (1) `select count(*) from (update ... returning 1) u` is not valid SQL — a data-modifying CTE must be the statement's top level, so use `with u as (update ...) select is((select count(*) from u), ...)` instead; (2) an UPDATE whose RLS `using` clause excludes the target row doesn't throw — it silently affects zero rows, so assert on row count, not `throws_ok`, for update/delete denial (insert denial does throw, since there's no row to filter yet). Also surfaced a bug this doc didn't anticipate: none of the migrations ever `GRANT` table privileges to `anon`/`authenticated`, so the retrofit initially failed on `permission denied` rather than on policy logic — see `docs/review/review-database.md`'s grants finding.

**Severity: High. Cheapest fix in this document.**

`supabase/tests/database/join_household.sql:33-34` (and every repetition at `:42-43`, `:49-50`, `:74-75`, `:82-83`) does:
```sql
select set_config('request.jwt.claims', json_build_object('sub', :'owner_id')::text, true);
select set_config('request.jwt.claim.sub', :'owner_id', true);
```
This makes `auth.uid()` return the right value — which is why the 13 assertions about join/merge/cascade semantics are real and worth keeping — but the session role is still `postgres`, which is BYPASSRLS. Every policy in `0003_households.sql:197-233` is inert for the whole file. The comment at `:5-8` describes the impersonation as complete; it isn't.

**Fix — add one line to each impersonation block:**
```sql
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', :'owner_id', 'role', 'authenticated'
)::text, true);
```
and `reset role;` before any fixture insert that legitimately needs superuser (the `auth.users` seeding at `:23-27` must stay privileged). Wrap it in helpers so it can't be forgotten:
```sql
create or replace function tests.login_as(uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$ language plpgsql;

create or replace function tests.logout() returns void as $$
begin
  perform set_config('request.jwt.claims', null, true);
  execute 'reset role';
end $$ language plpgsql;
```
Expect this to **break the existing file** — several assertions read across households (`:130-134`, `:149-153`) in ways RLS will now deny. That breakage is the finding: it tells you exactly which reads were only ever possible because the test was privileged.

**New file, `supabase/tests/database/rls.sql` — the highest-value DB test you don't have:**
```sql
begin;
select plan(14);
-- fixtures: alice + bob, each own household, each with an expense/category/cap
select tests.login_as(:'bob_id');
select is((select count(*)::int from public.expenses
           where household_id = :'alice_household'), 0,
          'bob sees zero expenses from alice''s household');
select is((select count(*)::int from public.categories
           where household_id = :'alice_household'), 0,
          'bob sees zero categories from alice''s household');
select is((select count(*)::int from public.budget_settings
           where household_id = :'alice_household'), 0,
          'bob sees zero budget rows from alice''s household');
select is((select count(*)::int from public.household_members
           where household_id = :'alice_household'), 0, 'members hidden');
select is((select count(*)::int from public.household_invites
           where household_id = :'alice_household'), 0, 'invites hidden');
select is((select count(*)::int from public.households
           where id = :'alice_household'), 0, 'household row hidden');
select is((select count(*)::int from public.profiles
           where id = :'alice_id'), 0, 'non-co-member profile hidden');

select throws_ok(
  format($$ insert into public.expenses (household_id, user_id, amount_minor, currency)
            values (%L, %L, 100, 'RSD') $$, :'alice_household', :'bob_id'),
  '42501', null, 'bob cannot insert into alice''s household');
select is((select count(*)::int from ( update public.expenses set amount_minor = 1
           where household_id = :'alice_household' returning 1 ) u), 0,
          'bob''s update of alice''s expenses touches zero rows');
select is((select count(*)::int from ( delete from public.expenses
           where household_id = :'alice_household' returning 1 ) d), 0,
          'bob''s delete of alice''s expenses touches zero rows');
select throws_ok(
  format($$ insert into public.expenses (household_id, user_id, amount_minor, currency)
            values (%L, %L, 100, 'RSD') $$, :'bob_household', :'alice_id'),
  '42501', null, 'bob cannot attribute an expense to alice (user_id = auth.uid())');
select * from finish();
rollback;
```
Then a third file, `constraints.sql`: `amount_minor >= 0` (`0001_phase1_init.sql:47`), `nudge_pct between 1 and 100` (`:39`), `locale in ('en','ru')` (`0004_profile_locale.sql:5`), uniqueness of `budget_settings.household_id`, `handle_new_user` creating exactly one household + 5 categories, the `before_auth_user_insert` allowlist trigger (`0002:37`) rejecting a non-allowlisted email, and invite-code generation being unique across two rapid calls.

### 4. E2E: no. Not yet.

**Severity: Low (as a gap). Firm recommendation: do not add Playwright now.**

The argument for E2E here is weakest exactly where the risk is highest. The dangerous failures in this app are *invisible in the browser* — Bob does not see a screen that says "you are reading Alice's data"; he sees a normal expense list. E2E is a poor detector of tenant leakage and an expensive one. Meanwhile the things E2E is good at (does the button submit, does the page render) are already covered by the component tests and the type checker, and the app is a small PWA with a single developer, where a flaky 4-minute browser suite gets `--skip`ped within a month. Adding Playwright before adding §2 and §3 would be spending the scarce testing budget on the cheapest risk.

**What buys the value instead**, in the same effort budget: the integration layer in §2 (catches real regressions, runs in seconds, no browser), plus the untested interactive components in §5 with `@testing-library/user-event` (already a dependency, unused as far as the existing tests go — they use `fireEvent`), plus a manual pre-release checklist of the four journeys.

**Revisit when any of these becomes true:** a second developer joins; you add a payment or export flow where a silent failure costs money; or you hit two production bugs in a row that all three lower layers were structurally incapable of catching. At that point the minimum viable set is exactly four journeys — log expense → home reflects it; set cap → home recomputes; invite → join from a second browser context → shared data visible; locale switch persists across reload — at roughly 1 day to build and a realistic 2-4 hours/month of maintenance against a UI that is still changing.

### 5. Component coverage: 20 of 25 untested, and the wrong 20

**Severity: Medium.**

Ranked by risk (interactive/stateful first — presentational components are effectively tested by the type checker and by looking at them):

| Rank | Component | Why it matters |
|---|---|---|
| 1 | `src/components/cap/SetCapForm.tsx` | Money input, minor-unit conversion, validation, submits a mutation. Off-by-100 here is a silent financial bug. |
| 2 | `src/components/categories/CategoryManager.tsx` | Full CRUD + optimistic state + archive semantics. Largest untested state machine in the app. |
| 3 | `src/components/settings/LocaleForm.tsx` | Writes the profile locale and must survive a reload; `profiles` locale is CHECK-constrained to `en`/`ru`. Also the only path exercising `actions/profile.ts`, which is untested entirely. |
| 4 | `src/components/history/CategoryFilter.tsx` | Drives query params into `listExpenses`; a broken filter silently shows the wrong month's money. |
| 5 | `src/components/auth/LoginForm.tsx` | Auth entry point; error states are what users hit when the allowlist rejects them. |
| 6 | `src/components/home/RecoveryPlan.tsx`, `ProjectionCard.tsx`, `NudgeBanner.tsx` | Conditional rendering off `kapa-math` outputs — the math is tested, the *thresholds that decide whether to show the scary banner* are not. |
| 7 | `src/components/home/SpentBar.tsx`, `PaceLine.tsx`, `DailySpendChart.tsx`, `TodayList.tsx` | Presentational-ish; chart has some geometry worth a smoke test. |
| 8 | `pwa/InstallPrompt.tsx`, `pwa/OfflineBanner.tsx`, `settings/DisplayNameForm.tsx`, `history/CategoryBreakdown.tsx` | Lower risk, but `DisplayNameForm` also writes the profile. |
| 9 | `ui/Button.tsx`, `ui/PageHeader.tsx`, `ui/PageLoadingShell.tsx`, `ui/icons.tsx` | Do not test these. |

**Judging the existing five: good, with one systematic weakness.** They query by accessible role and name throughout (`getByRole('button', { name: 'Add expense' })`, `src/components/add/AddExpenseForm.test.tsx:34`) — no `getByTestId`, no `container.querySelector`, no snapshot files anywhere in the repo. `AppHeader.test.tsx:17-19` even documents *why* it needs `{ hidden: true }`, which is the right instinct. `Toast.test.tsx` asserts the politeness announcement, i.e. real a11y behavior.

Two criticisms. First, `AddExpenseForm.test.tsx:54` asserts `toHaveClass('text-accent-700')` — that is an implementation detail; a Tailwind palette rename breaks a passing test, and switching to an icon or `aria-invalid` while keeping the class silently keeps it green. Assert on text or an ARIA attribute instead. Second, all five use `fireEvent` rather than `userEvent`, despite `@testing-library/user-event` being installed. `fireEvent.click` skips pointer/focus sequencing, so a control that is unreachable by keyboard or covered by an overlay still passes. Migrate; it is a mechanical change.

### 6. Server Components and pages: untested, and mostly fine

**Severity: Low-Medium.**

No page or layout has a test. Async RSCs cannot be rendered by Testing Library, and every workaround (calling the component as a function, `renderToString` with a hand-rolled request context) tests a fiction.

**Pragmatic stance for this stack:** don't chase RSC rendering. Instead (a) keep pages thin — fetch, then delegate to a tested client component, which the codebase mostly already does; (b) cover the *fetch* half via the §2 integration layer, since pages call the same `src/lib/queries/*` functions; (c) cover the *render* half via the component tests in §5. The genuinely untested residue is the auth-redirect guard at the top of each page, which is one line per page and better asserted once in `dal` plus once in integration than 8 times in fictional render harnesses. If you ever want the real thing, that is what the E2E in §4 would buy — another reason to keep §4 on the shelf rather than off the table.

### 7. Domain-logic tests: well-chosen examples, no structure to generalize them

**Severity: Medium.**

(Correctness of the math is another agent's call; this is about whether the tests are *shaped* to catch a bug.)

**Genuinely strong:** these are not re-assertions of implementation output. `kapa-math.test.ts:42-47` picks the Belgrade CET→CEST transition deliberately and asserts both ends of the window; `:71-77` asserts the same instant yields different day-counts in two timezones; `:96-101` covers `spent == cap` and `spent > cap`; `:105` names the div-by-zero the case is guarding. Someone thought about boundaries. `daysInMonth` covers 31/30/28/29 including a leap year (`:18-23`) and rejects malformed input (`:24-27`).

**Weaknesses:**

1. **Every case is a hand-written one-off.** Nine `describe` blocks with 2-6 `it`s each and no table. That is fine at this size but means adding a new month or timezone is a copy-paste, so nobody does it — Belgrade and UTC are the only two zones ever tested, and a negative-offset zone (`America/New_York`) has never run through `monthWindow`. Convert to table-driven:
```ts
it.each([
  ['UTC',              '2026-08', '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'],
  ['Europe/Belgrade',  '2026-08', '2026-07-31T22:00:00.000Z', '2026-08-31T22:00:00.000Z'],
  ['America/New_York', '2026-08', '2026-08-01T04:00:00.000Z', '2026-09-01T04:00:00.000Z'],
  ['Asia/Kolkata',     '2026-08', '2026-07-31T18:30:00.000Z', '2026-08-31T18:30:00.000Z'], // :30 offset
  ['Pacific/Kiritimati','2026-08','2026-07-31T10:00:00.000Z', '2026-08-31T10:00:00.000Z'], // UTC+14
])('monthWindow(%s)', (tz, month, start, end) => { … });
```
   The half-hour and UTC+14 rows are the ones most likely to find something.
2. **Missing boundary classes.** No zero/negative/huge inputs: `remaining(0, 0)`, `safeDaily` with a negative remaining, `daysInMonth('2026-00')`, `projection` with `elapsed > daysInMonth`, `evenPace(cap, 0, 30)`. `spentPct` tests rounding at .5 and .4 (`:158-161`) but not the banker's-rounding-adjacent `.5` on an odd value, nor a cap large enough to lose precision — worth one assertion that `amount_minor` values near `Number.MAX_SAFE_INTEGER` don't silently drift, since the column is `bigint` (`0001_phase1_init.sql:47`) and JS numbers are not.
3. **Property-based testing is the right tool for the invariants here** and would pay for itself. Add `fast-check` (dev-only, ~1 dependency) and encode the four money/day invariants the hand-written cases can only sample:
```ts
import fc from 'fast-check';
const minor = fc.integer({ min: 0, max: 10 ** 12 });

it('remaining + spent never exceeds cap, and is never negative', () =>
  fc.assert(fc.property(minor, minor, (cap, spent) => {
    const r = remaining(cap, spent);
    return r >= 0 && r <= cap && (spent >= cap ? r === 0 : r === cap - spent);
  })));

it('safeDaily * (daysLeft+1) never exceeds remaining (no over-allocation)', () =>
  fc.assert(fc.property(minor, fc.integer({ min: 0, max: 31 }), (rem, dl) =>
    safeDaily(rem, dl) * (dl + 1) <= rem + (dl + 1))));  // allow <1 minor unit rounding

it('daysLeft + dayOfMonth === daysInMonth, for every day of every month of 2024-2027', () =>
  fc.assert(fc.property(fc.date({ min: new Date('2024-01-01'), max: new Date('2027-12-31') }),
    fc.constantFrom('UTC','Europe/Belgrade','America/New_York','Asia/Kolkata'),
    (now, tz) => { /* … */ })));

it('spentPct is monotonic in spent and always within [0,100]', () =>
  fc.assert(fc.property(minor, minor, minor, (cap, a, b) => {
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    const p = spentPct(lo, cap), q = spentPct(hi, cap);
    return p >= 0 && q <= 100 && p <= q;
  })));
```
   The day-count one in particular will find DST bugs that no amount of hand-picked dates will, because it sweeps all ~1,460 days across four offsets including a half-hour zone.

### 8. i18n: key parity is the easy half

**Severity: Medium.**

`src/test/messages.test.ts:23-32` guards key parity and non-empty values. That is real and worth keeping. It catches nothing else.

Three uncaught classes, in priority order:

1. **Interpolation-param drift.** If `en.json` has `"{count} left"` and `ru.json` has `"{cnt} осталось"`, keys match, values are non-empty, and the Russian UI renders a literal `{cnt}` — or next-intl throws at runtime, in production, in the locale the developer doesn't read. Add:
```ts
const PARAM = /\{(\w+)(?:,\s*\w+.*?)?\}/g;
function params(s: string) { return new Set([...s.matchAll(PARAM)].map((m) => m[1])); }

it('en and ru use the same interpolation params for every key', () => {
  const mismatches = keyPaths(en).filter((p) => {
    const a = params(get(en, p)), b = params(get(ru, p));
    return a.size !== b.size || [...a].some((k) => !b.has(k));
  });
  expect(mismatches).toEqual([]);
});
```
2. **ICU plural-form errors.** Russian has three plural categories (`one`/`few`/`many`) where English has two. A `ru` message that only declares `{n, plural, one{…} other{…}}` is *valid ICU* and renders `other` for 2-4, which is grammatically wrong and will never fail a test. Assert that any `ru` value containing `plural` declares `one`, `few`, `many`, and `other`; and — cheaper and stronger — compile every message with next-intl's formatter at 0/1/2/5/11/21 and assert none throws:
```ts
import { createTranslator } from 'next-intl';
it.each(['en', 'ru'])('every %s message formats without throwing', (locale) => {
  const t = createTranslator({ locale, messages: locale === 'en' ? en : ru });
  for (const path of keyPaths(en)) {
    for (const n of [0, 1, 2, 5, 11, 21, 101]) {
      expect(() => t(path, { count: n, n, name: 'x', amount: n, code: 'X' })).not.toThrow();
    }
  }
});
```
   This is the single highest-value i18n test to add — it compiles every ICU string in both locales, which nothing does today.
3. **Raw untranslated strings in the UI.** Nothing detects a hard-coded English literal in a component. Two cheap guards: an ESLint rule (`react/jsx-no-literals` scoped to `src/components/**`, with a whitelist for punctuation/numerals), and a component-test helper that renders with a pseudo-locale where every message is replaced by `«…»` and asserts no bare Latin word survives. The ESLint rule alone catches most of it and costs one config line — cheaper than any test.

Also note `src/test/setup-intl-server.ts:24-29` reimplements interpolation with `/\{(\w+)\}/g`, which does **not** handle ICU plural/select syntax — its docstring admits action copy is plain strings only (`:5-7`). The moment someone adds a plural to an action error message, the action test asserts against a raw un-formatted ICU blob and probably still passes because the assertion is a substring match. Worth a guard: make `makeT` throw if the looked-up template contains `, plural,` or `, select,`.

### 9. Infrastructure: clean, with two gaps

**Severity: Low-Medium.**

**Good.** The two-project split in `vitest.config.mts` is the right call — node tests can't accidentally rely on jsdom globals, and jsdom tests get `@vitejs/plugin-react` without slowing the node project. `setup.ts:7-8` explicitly registers `cleanup()` with a comment explaining why RTL doesn't self-register outside Jest — that's a real footgun handled correctly. `intl.tsx` wraps in the *real* `NextIntlClientProvider` with the *real* `en.json` rather than mocking `useTranslations`, so component tests assert against shipped copy; that is a better decision than most codebases make.

**Shared mutable state / order dependence: essentially clean.** `FakeDb` is constructed fresh per test via `fakeSupabase()` at each call site, and `seed()` defensively copies rows (`fake-supabase.ts:33`). `dal.test.ts:12-14` correctly calls `vi.resetModules()` to defeat React `cache()` memoization across tests — a subtle trap, handled. The one order-dependence risk is `FakeDb.errors` surviving an un-consumed `failNext` — but since the db is per-test, it can't leak across tests. `Toast.test.tsx` swaps in fake timers and restores them in `afterEach`, correctly.

**Gap 1 — no coverage reporting or thresholds.** There is no `coverage` block in `vitest.config.mts` and no coverage step in CI, so "25 components, 5 tested" had to be counted by hand. Add:
```ts
coverage: {
  provider: 'v8',
  reporter: ['text-summary', 'lcov'],
  include: ['src/**/*.{ts,tsx}'],
  exclude: ['src/**/*.test.*', 'src/test/**', 'src/**/*.d.ts'],
  thresholds: { lines: 60, functions: 60, branches: 50, autoUpdate: true },
}
```
Set the thresholds at *today's* numbers with `autoUpdate`, which makes the ratchet one-directional without ever blocking a legitimate PR. Do not chase a percentage target — the point is to make a *drop* visible, not to hit 80%.

**Gap 2 — flake and CI-cost.** `supabase start` is the long pole (container pull + migrations, typically 1-3 min warm, worse cold). It is already in CI and already the single most valuable non-unit step, so the risk is not that it's slow — it's that as it gets slower someone moves it behind a label or a nightly, at which point the *only* real-database coverage stops running on PRs. Guard against that: keep `npm test` (unit) as the fast pre-commit gate, run DB + integration as a separate parallel job rather than a serial step so it doesn't lengthen the critical path, and cache the Supabase CLI + images. Also add `--reporter=verbose` for the DB job so a pgTAP failure names the assertion.

Minor flake sources today: none observed — no `Date.now()` without injection (`kapa-math` takes `now` as a parameter, `upsertCap` takes `now = new Date()`), no network, no real timers except the ones faked. The suite's 1.2s is credible.

**`factories.ts` ergonomics.** Good defaults, correct partial-override shape. Two nits: the `as Expense` cast at `:20` defeats the type checking the factory exists to provide — restructure so the return type is inferred rather than asserted. And there are no *row*-shaped factories (snake_case DB rows), which is why every query test hand-writes 12-line row literals — `src/lib/queries/expenses.test.ts:13-44` spends 30 lines seeding three rows that differ in two fields. Add `expenseRow()`, `categoryRow()`, `householdRow()` and those tests halve in size, which directly lowers the cost of adding the cases §2 and §3 call for.

### 10. Regression safety: what breaks loudly vs. silently

**Severity: High — this is the section to read if you read one.**

**Breaks loudly (good):** renaming a column in a `.select()` → mapper test fails. Changing `.order()` direction → `queries/expenses.test.ts:46` fails. Changing a handler's status code → route tests fail. Renaming a translation key → `messages.test.ts` fails and every component test using that string fails. Changing a `kapa-math` formula → many assertions fail. Deleting `.eq('household_id', …)` from `updateExpense`/`deleteExpense` → the fake's filter chain no longer excludes the foreign row, so `mutations/expenses.test.ts` fails. That last one is the fake earning its keep.

**Fails silently — the named list:**

1. **Dropping `.eq('household_id')` from a *read*, if no test seeds a foreign row.** `queries/expenses.test.ts:10-47` does seed `household_id: 'other'`, so `listExpenses` is protected. Verify every other query test does the same — any query whose test seeds only in-household rows will pass with the scope filter deleted, and RLS *would* save you in production, which means the bug lands as "works fine" until someone changes a policy.
2. **Writing the wrong `user_id`/`household_id` on insert.** The fake has no `auth.uid()` and no policy, so `createExpense(client, householdId, WRONG_USER, input)` (`mutations/expenses.ts:35`) succeeds in tests and is rejected by `expenses_insert` in production. A refactor that reorders those two positional string arguments — both `string`, both accepted by the type checker — is invisible to the entire suite. **Mitigate immediately** by making them branded types (`HouseholdId`, `UserId`) so the compiler catches the swap; that is 20 minutes and closes a whole class.
3. **`upsertCap` overwriting the wrong household's row.** Per `fake-supabase.ts:215-219`, matching on any shared field. If `onConflict` were changed to the wrong column, or the unique constraint dropped from a migration, `mutations/cap.test.ts` stays green. Silent cross-tenant data loss.
4. **A `.single()` that starts matching multiple rows.** The fake collapses 0-row and N-row into the same error (`:178-182`), and `maybeSingle()` silently returns the first (`:183-185`). A join or filter change that duplicates rows produces "works, returns something plausible" in tests and a `PGRST116` 500 in production.
5. **Any new constraint, trigger, or default added in a migration.** Nothing in the unit suite executes SQL, and pgTAP covers exactly one function. Add a `check` and forget to update the Zod schema in `validation.ts` → every test passes, production 500s.
6. **Second-statement failures in multi-statement mutations.** Because `failNext` is table-keyed and consumed by the first query (`:44-46`, `:190-191`), the "currency lookup succeeded, insert failed" path in `createExpense` cannot be tested and is not.
7. **`mappers.ts` field drift.** Untested directly; only exercised transitively. A mapper that starts returning `undefined` where the domain type says `null` passes wherever the assertion is `objectContaining` (`queries/expenses.test.ts:152-154` asserts exactly two fields of a seven-field object — the other five could all be wrong).
8. **`attribution.ts`, `actions/profile.ts`, `auth/callback/route.ts`, `keepalive`, `proxy.ts`** — zero tests. Any change to them breaks nothing in CI. `auth/callback` is the login path; a regression there is a total outage that the suite would call green.
9. **RLS policy edits.** `0003_households.sql:197-233` can be rewritten to `using (true)` and every one of the 192 tests plus the 13 pgTAP assertions still passes. This is the most alarming sentence in this review.
10. **The known 500 at `/api/cap`.** `src/app/api/cap/route.test.ts:46-51` pins the buggy behavior as expected. When someone fixes `json(null, { status: 204 })`, a *correct* change turns the suite red — an inverted incentive. Convert it to `it.fails(...)` or a skipped test with a linked issue so the suite pressures toward the fix rather than away from it.

---

### Recommended plan

**First — one afternoon, closes the biggest hole.**
1. Add `set local role authenticated` (via `tests.login_as`/`tests.logout` helpers) to `supabase/tests/database/join_household.sql`; expect and fix the resulting failures. *(1-2h)*
2. Write `supabase/tests/database/rls.sql` — the ~14 assertions in §3: for each of the 7 tables, a user in household A gets 0 rows from B; plus insert/update/delete denial and the `user_id = auth.uid()` attribution check. *(2-3h)*
3. Fix `src/app/api/cap/route.test.ts:46-51` to `it.fails` so the real 500 bug stops being pinned as correct. *(10m)*
4. Brand `HouseholdId`/`UserId` so the positional-argument swap in §10.2 becomes a compile error. *(30m)*

**Second — one to two days, builds the missing middle.**
5. Add the `integration` Vitest project + `src/test/setup-integration.ts` two-user/two-household harness from §2, wired into the CI job that already runs `supabase start`. *(4h)*
6. Write integration cases 1-6 from §2 (per-table isolation, foreign update/delete/insert, upsert cross-tenant, invite/join round-trip). These reuse production functions unchanged thanks to the existing DI. *(4-6h)*
7. Harden `fake-supabase.ts`: honour `onConflict` and throw without it; PostgREST-shaped `PGRST116` with `code`; make >1 row a hard error under both `.single()` and `.maybeSingle()`; key `failNext` by `table:mode`. *(2h)*
8. Add `constraints.sql` pgTAP for checks, uniqueness, `handle_new_user`, and the allowlist trigger. *(2h)*

**Third — steady state, a few hours each.**
9. Component tests for `SetCapForm`, `CategoryManager`, `LocaleForm`, `CategoryFilter`, in that order; migrate all component tests from `fireEvent` to `user-event`; drop the `toHaveClass` assertion at `AddExpenseForm.test.tsx:54`. *(1 day)*
10. i18n: the ICU compile-every-message test and the interpolation-param parity test from §8; add `react/jsx-no-literals` to ESLint. *(2h)*
11. `fast-check` property tests for the four money/day invariants in §7; table-drive `monthWindow` with a half-hour and a UTC+14 zone. *(3h)*
12. Coverage reporter with `autoUpdate` thresholds pinned at today's numbers; row-shaped factories in `factories.ts`. *(2h)*
13. Backfill tests for `mappers.ts` and `actions/profile.ts`; smoke-test `auth/callback/route.ts` through the integration harness. *(4h)*

**Explicitly not now:** Playwright/E2E (§4), visual regression, automated a11y sweeps. Revisit E2E when a second developer joins or after two production bugs the lower layers couldn't structurally catch.

### What's done well

- **Dependency injection over module mocking.** Every query/mutation takes the client as its first argument (`fake-supabase.ts:6-8`), which is why the integration layer in §2 costs hours rather than weeks. This is the single best structural decision in the codebase and it is currently only half-exploited.
- **Real messages, not mocked i18n.** `intl.tsx:12-21` renders through the actual `NextIntlClientProvider` with the actual `en.json`, so component tests assert on shipped copy and exercise real ICU. Most codebases stub `useTranslations` to the identity function and lose all of that.
- **Boundary-aware domain tests.** The DST-transition case (`kapa-math.test.ts:42-47`), the same-instant-two-timezones case (`:71-77`), and the div-by-zero guard (`:105`) are chosen, not generated — someone reasoned about where this math breaks.
- **Comments explain why, including the awkward parts.** `setup.ts:5-6`, `AppHeader.test.tsx:17-19`, `dal.test.ts:11-12`, and the `fake-supabase.ts` docstring all document non-obvious constraints. The `cap/route.test.ts:46-50` comment is the wrong *resolution* but exactly the right *instinct* — the bug was found, understood, and written down rather than papered over.
- **Accessible queries throughout.** Zero `getByTestId`, zero `container.querySelector`, zero snapshots across the whole repo. The five component tests assert user-visible behavior.
- **CI already does the hard part.** `format:check` → `lint` → `typecheck` → unit → real `supabase start` + `supabase test db` → `build` is a genuinely good pipeline. The database is already booted in CI; §2 and §3 are largely about *using* what you're already paying for.
- **Clean isolation.** Per-test `FakeDb`, defensive row copies, explicit `resetModules` where React `cache()` would otherwise leak, fake timers restored. No flake observed, and 1.2s for 192 tests is a real asset worth protecting by keeping the slower layers in separate projects.
