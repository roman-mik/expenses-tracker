# Horizon Epic C — Obligations and spending

**Status:** planned, not started · **Spec:** `docs/horizon-user-stories.md` §5 Epic C · **Plan of record:** `PLAN.md` §9

---

## 1. Context

Epic A (accounts, reporting currency, FX snapshots) and Epic B (income streams B1–B4, the work
calendar, the pure schedule engine) are shipped. Epic C is the other half of the input model:
*where money goes* — obligations with real due dates, daily-accrual spending with a cap, and
dated one-off events. With it, Epic D's projection engine has a complete picture to project;
without it there is nothing to subtract.

`/horizon/money-out` is still `HorizonPlaceholder` (`apps/web/src/app/horizon/money-out/page.tsx`).
`HorizonRail.tsx` already links it, so this epic replaces a placeholder rather than adding nav.

Epic B deliberately left two things for this epic: `covers_period` exists on
`horizon_income_schedules` but **no code reads it** (C2 is greenfield), and its own plan predicted
an Obligation "will likely reuse this table's *shape*, not this table itself."

**Scope for this pass: the whole epic, C1–C7.** Unlike Epic B's B5 deferral, nothing here depends
on Epic E's `Scenario` model — C6 (billable-hours cost) only needs Epic B's hourly-rate math and
`fx.ts`, and C7 (categories + share-of-total) only needs the obligations/one-offs this epic
already creates. Deferring them would just mean redoing the category/hours plumbing later for no
reason, so both `[P2]`/`[P3]` stories are pulled in now.

**Decisions taken (this session):**

| Question | Decision |
|---|---|
| Scope | The whole epic, C1–C7 — including C6 `[P2]` and C7 `[P3]` |
| Schedule storage | A parallel `horizon_obligation_schedules` table with the identical shape to `horizon_income_schedules`, fed by a generalized pure engine. No data migration of existing income rows |
| C4 daily expenses | New `horizon_daily_expenses`, and the cap tracker also reads Pocket's `expenses` table for actuals in the period — planned vs actual side by side |
| Obligation category | A check-constrained text value, not an FK to Pocket's `categories` and not free text. The spec models `category` as a plain field on `Obligation`/`OneOffEvent`; a fixed set keeps C7's share colours and i18n labels deterministic |
| `account_id` on daily expenses / one-offs | Added, though the spec's `DailyExpense`/`OneOffEvent` omit it — Epic D needs to know which account drains for the projection to be dated against a real balance |

**Non-goals:** the projection engine (Epic D), scenarios (Epic E), target-rate solving (Epic F).
Any of those appearing in this work is scope creep.

---

## 2. Data model

### 2a. Schedule engine generalization (prerequisite, no new tables)

`apps/web/src/lib/horizon/income/schedule.ts` is already pure and takes a bare `IncomeSchedule`
plus a `ScheduleCalendar`. It moves to **`apps/web/src/lib/horizon/schedule.ts`** (with
`schedule.test.ts` alongside it) and its parameter widens to a structural interface:

```ts
export interface ScheduleRule {
  kind: ScheduleKind;
  dayOfMonth: number | null;
  intervalDays: number | null;
  nthWeekday: number | null;
  weekday: number | null;
  anchorDate: string | null;
  slippagePolicy: SlippagePolicy;
  coversPeriod: CoversPeriod;
}
```

`IncomeSchedule` and the new `ObligationSchedule` both structurally satisfy `ScheduleRule` (each
adds its own `id` and owner FK), so `generateDates` / `applySlippage` / `nextSixDates` need no
logic change — only their type parameter widens. `nextDatesForSchedules` becomes generic over
`T extends ScheduleRule & { id: string }`.

The shared `as const` tuples (`ScheduleKind`, `SLIPPAGE_POLICIES`, `COVERS_PERIOD_VALUES`,
`RECURRENCE_VALUES`, `CONFIDENCE_VALUES`) move from `lib/horizon/income/types.ts` up to
`lib/horizon/types.ts`, and every import site updates to the new path — a re-export shim would
leave a dead export behind and trip `knip`, which is CI-enforced.

New pure function on the same module, powering C2:

```ts
coveredPeriod(paymentDate: string, rule: ScheduleRule): string  // 'YYYY-MM'
// same → the payment month; next → +1 month; previous → −1 month.
// Takes the UNSLIPPED generated date, not the slipped one: rent due 31 Aug
// that slips to 1 Sep still covers September, not October (D4's whole point).
```

The presentation label ("September rent, paid 28 August") composes `coveredPeriod` with the
slipped date at the UI layer — the engine only returns the period, never a formatted string.

`coveredPeriod` must derive from the **unslipped** generated date, not the slipped one: rent due
31 Aug with `coversPeriod=next` that slips to 1 Sep must still read "September rent", not
"October". `nextSixDates`/`nextDatesForSchedules` already preserve the unslipped date as
`originalDate`, so callers pass that (`originalDate ?? date`), never the shifted field.

The spec's only worked example of `coversPeriod` is month-shaped (rent, a monthly bill) — there's
no basis for what "covers the next period" means for an `everyNDays` or `oneOff` schedule. Rather
than invent that semantics, the `ScheduleEditor`'s `coversPeriod` control is shown only for
`dayOfMonth`, `monthEnd`, and `nthWeekday` (`showCoversPeriod` stays true for those three kinds);
`everyNDays` and `oneOff` schedules default to `'same'` and never expose the picker.

### 2b. `supabase/migrations/0020_horizon_obligations.sql`

```sql
create table public.horizon_obligations (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households(id) on delete cascade,
  account_id        uuid not null references public.horizon_accounts(id) on delete cascade,
  name              text not null,
  category          text not null,
  amount_minor      bigint not null,                   -- per occurrence, never a monthly total (D1)
  currency          text not null,
  recurrence        text not null default 'recurring', -- recurring | oneOff
  confidence        text not null default 'confirmed', -- confirmed | expected | uncertain
  start_date        date not null,
  end_date          date,
  sort_order        int not null default 0,
  archived          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint horizon_obligations_category_allowed
    check (category in ('housing','utilities','debt','subscriptions','insurance',
                         'transport','family','other')),
  constraint horizon_obligations_currency_allowed
    check (currency in ('RSD','EUR','USD','RUB')),
  constraint horizon_obligations_recurrence_allowed
    check (recurrence in ('recurring','oneOff')),
  constraint horizon_obligations_confidence_allowed
    check (confidence in ('confirmed','expected','uncertain')),
  constraint horizon_obligations_name_len
    check (char_length(btrim(name)) between 1 and 60),
  constraint horizon_obligations_end_after_start
    check (end_date is null or end_date >= start_date)
);
create index horizon_obligations_household_idx
  on public.horizon_obligations (household_id, sort_order);

create table public.horizon_obligation_schedules (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households(id) on delete cascade,
  obligation_id      uuid not null references public.horizon_obligations(id) on delete cascade,
  kind               text not null,   -- dayOfMonth | monthEnd | everyNDays | nthWeekday | oneOff
  day_of_month       int,
  interval_days      int,
  nth_weekday        int,
  weekday            int,
  anchor_date        date,
  slippage_policy    text not null default 'nextBusinessDay',
  covers_period      text not null default 'same',   -- same | next | previous (C2)
  created_at         timestamptz not null default now(),
  constraint horizon_obligation_schedules_kind_allowed
    check (kind in ('dayOfMonth','monthEnd','everyNDays','nthWeekday','oneOff')),
  constraint horizon_obligation_schedules_slippage_allowed
    check (slippage_policy in ('nextBusinessDay','prevBusinessDay','none')),
  constraint horizon_obligation_schedules_covers_allowed
    check (covers_period in ('same','next','previous')),
  constraint horizon_obligation_schedules_day_of_month_range
    check (day_of_month is null or day_of_month between 1 and 31),
  constraint horizon_obligation_schedules_nth_weekday_range
    check (nth_weekday is null or nth_weekday between 1 and 5),
  constraint horizon_obligation_schedules_weekday_range
    check (weekday is null or weekday between 0 and 6)
);
create index horizon_obligation_schedules_obligation_idx
  on public.horizon_obligation_schedules (obligation_id);
create index horizon_obligation_schedules_household_idx
  on public.horizon_obligation_schedules (household_id);
```

Column-for-column the same shape as `horizon_income_streams`/`horizon_income_schedules` (0019) —
same reasoning: a household can owe rent on the 28th *and* face a card payment on the 5th, so the
schedule is a child table, not flat columns. `household_id` is denormalized onto
`horizon_obligation_schedules` for the same reason as 0019/0016: every RLS policy stays a direct
`is_household_member(household_id)` check, no join.

### 2c. `supabase/migrations/0021_horizon_daily_expenses.sql`

```sql
create table public.horizon_daily_expenses (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households(id) on delete cascade,
  account_id          uuid not null references public.horizon_accounts(id) on delete cascade,
  pocket_category_id  uuid references public.categories(id) on delete set null,
  name                text not null,
  daily_amount_minor  bigint not null,
  currency            text not null,
  charge_cadence      text not null default 'daily',  -- daily | weekly | monthly
  cap_minor           bigint,
  -- also the anchor for weekly charges (date + 7k); an end date stops a
  -- retired budget from accruing forever.
  start_date          date not null,
  end_date            date,
  archived            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint horizon_daily_expenses_currency_allowed
    check (currency in ('RSD','EUR','USD','RUB')),
  constraint horizon_daily_expenses_cadence_allowed
    check (charge_cadence in ('daily','weekly','monthly')),
  constraint horizon_daily_expenses_name_len
    check (char_length(btrim(name)) between 1 and 60),
  constraint horizon_daily_expenses_amount_positive
    check (daily_amount_minor > 0),
  constraint horizon_daily_expenses_cap_positive
    check (cap_minor is null or cap_minor > 0),
  constraint horizon_daily_expenses_end_after_start
    check (end_date is null or end_date >= start_date)
);
create index horizon_daily_expenses_household_idx
  on public.horizon_daily_expenses (household_id);

create table public.horizon_one_off_events (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  account_id     uuid not null references public.horizon_accounts(id) on delete cascade,
  name           text not null,
  category       text not null,
  amount_minor   bigint not null,
  currency       text not null,
  date           date not null,
  direction      text not null,   -- in | out
  created_at     timestamptz not null default now(),
  constraint horizon_one_off_events_currency_allowed
    check (currency in ('RSD','EUR','USD','RUB')),
  constraint horizon_one_off_events_direction_allowed
    check (direction in ('in','out')),
  constraint horizon_one_off_events_category_allowed
    check (category in ('housing','utilities','debt','subscriptions','insurance',
                         'transport','family','gift','bonus','other')),
  constraint horizon_one_off_events_name_len
    check (char_length(btrim(name)) between 1 and 60),
  constraint horizon_one_off_events_amount_positive
    check (amount_minor > 0)
);
create index horizon_one_off_events_household_idx
  on public.horizon_one_off_events (household_id, date);
```

`pocket_category_id` is the seam C4's cap tracker uses to read Pocket's real `expenses` for the
same category — nullable and `on delete set null` so deleting a Pocket category never breaks a
Horizon daily-expense row, it just stops matching actuals.

**D1 is enforced by omission, not by a rule**: `amount_minor`/`daily_amount_minor` are always
per-occurrence or per-day figures, and there is no "monthly total" column on any table — spreading
a total evenly across the month is unrepresentable in this schema, not merely discouraged in the UI.

RLS/grants/`updated_at` trigger on every table above: the same four `is_household_member(household_id)`-gated
policies, grants to `authenticated` and `service_role`, as every other Horizon table.

---

## 3. Application layers

```
apps/web/src/lib/horizon/
  schedule.ts             MOVED from income/schedule.ts. PURE. now takes ScheduleRule.
                           + new coveredPeriod().
  schedule.test.ts         MOVED, unchanged assertions, + coveredPeriod cases.
  types.ts                  + shared enum tuples moved up from income/types.ts
  spending/
    types.ts                Obligation, ObligationSchedule, DailyExpense, OneOffEvent
    mappers.ts               toObligation, toObligationSchedule, toDailyExpense, toOneOffEvent
    validation.ts            Zod schemas, same z.discriminatedUnion idiom as income
    spending-math.ts        PURE. monthlyObligationTotal, dailyExpenseForMonth,
                             monthLengthVariants, chargeDates, chargeAmount, categoryShares
    spending-math.test.ts
    hours.ts                PURE. blendedHourlyRate, obligationCostInHours,
                             availableWorkingHours
    hours.test.ts
  queries/spending.ts        obligations+schedules, daily expenses, one-offs,
                              sumPocketExpenses (reads Pocket's `expenses`)
  mutations/spending.ts       CRUD for all four entities
apps/web/src/app/actions/
  horizon-spending.ts
```

Reuse exactly as Epic B's plan lists (`Currency`/`Money`/`CURRENCIES`, `formatMoney`,
`verifySession`/`getHouseholdId`, `createClient`, `reportError`, `ActionResult`, the
mutation/action shape from `income.ts`/`horizon-income.ts`), plus `convert`/`pickRate` from
`lib/horizon/fx.ts` and `workingDaysInMonth`/`monthlyIncomeForStream` from
`lib/horizon/income/income-math.ts`.

### `lib/horizon/spending/spending-math.ts`

```ts
monthlyObligationTotal(obligation, schedules, month, calendar): Money
// amountMinor × occurrences actually falling in the month (via generateDates)
// — same discipline as income-math.ts's monthlyIncomeForStream. A
// twice-monthly obligation is never silently treated as once/month.

dailyExpenseForMonth(dailyAmountMinor, month): Money
// dailyAmount × CALENDAR days in the month — deliberately not working days;
// groceries don't take weekends off.

monthLengthVariants(dailyAmountMinor): { d28: Money; d30: Money; d31: Money }
// C4's "shows the monthly total for 28-, 30- and 31-day months".

chargeDates(expense, { from, to }): string[]
// The dates a daily-accrual expense actually posts on, per chargeCadence.

chargeAmount(dailyAmountMinor, cadence, periodDays): Money
// The lump sum for one charge — dailyAmount × the number of days it covers.

categoryShares(rows, reportingCurrency, rates, onOrBefore)
  : { category: string; totalMinor: Money; sharePct: number; hasMissingRate: boolean }[]
// C7. Converts each row to reportingCurrency via fx.ts first. A row with no
// usable rate is excluded from the total and flagged (hasMissingRate) rather
// than thrown — mirrors today.ts's summarizeToday.
```

### `lib/horizon/spending/hours.ts`

```ts
blendedHourlyRate(streams, calendar, month, reportingCurrency, rates): Money | null
// Σ (converted monthly income of non-archived, recurring, hourly streams)
// ÷ Σ (hoursPerDay × workingDaysInMonth) — "what an hour is actually worth"
// across every hourly stream, not a pick of one. null if a needed rate is
// missing.

obligationCostInHours(amountMinor, currency, blendedRateMinor, reportingCurrency, rates, onOrBefore)
  : number | null
// amount ÷ (blendedRate × fx) — C6's "amount ÷ (hourly rate × reporting FX)".

availableWorkingHours(streams, calendar, month): number
// Σ hoursPerDay × workingDaysInMonth across active hourly streams — the
// figure C6's total-obligation-hours gets compared against.
```

---

## 4. Screens

| Route | Content | Stories |
|---|---|---|
| `/horizon/money-out` (real content, replaces `HorizonPlaceholder`) | Obligations grouped by category with a share-of-total bar; per-row due-date column showing the next occurrence plus its covered-period label; billable-hours column; daily-expense list with a cap tracker (planned vs Pocket actual, 28/30/31-day totals); one-off events list, visually distinct from recurring rows | C1–C7 |

**Components** (new, under `apps/web/src/components/horizon/money-out/`):
`{ObligationList,ObligationForm,DailyExpenseList,DailyExpenseForm,CapTracker,OneOffEventList,OneOffEventForm,CategoryShareBar}.tsx`.

**Shared** (moved from `money-in/`): `components/horizon/schedule/ScheduleEditor.tsx`, now
taking `rules`/`onAdd`/`onRemove` props so money-in and money-out share one editor instead of
growing a near-duplicate.

Reuse `Button`, `PageHeader`/`PageLoadingShell`, `useToast()`, `formatMoney`, the
`CURRENCY_EXPONENT` major↔minor pattern and radiogroup-style pickers already established in
`IncomeStreamForm.tsx`/`AccountForm.tsx`, and the list/add/archive shape of `IncomeStreamList.tsx`.

**i18n:** add `Horizon.moneyOut.*` (replacing the `placeholder` key path) and new `Errors.*` keys
to **both** `en.json` and `ru.json` — `src/test/messages.test.ts` fails CI on key drift.

---

## 5. Tests

| Layer | Files | What it must prove |
|---|---|---|
| Unit (node) | `lib/horizon/schedule.test.ts` (moved) | All existing 24 cases pass unchanged against the widened `ScheduleRule` type; `coveredPeriod` for same/next/previous, across a year boundary, and derived from the unslipped date (the key case) |
| Unit (node) | `lib/horizon/spending/spending-math.test.ts` | Occurrence-counted monthly totals (twice-monthly ≠ once/month); daily accrual counts calendar days not working days; 28/30/31 variants; shares sum to 100% and a missing-rate row is excluded-and-flagged, never thrown |
| Unit (node) | `lib/horizon/spending/hours.test.ts` | Blended rate across two hourly streams in different currencies; `null` on a missing FX rate; the over-available-hours condition is detected |
| Unit (node) | `queries/spending.test.ts`, `mutations/spending.test.ts`, `app/actions/horizon-spending.test.ts` | Household scoping via `fake-supabase.ts`/`factories.ts`; an obligation's schedules cascade-delete with it; unauthenticated → error; bad input → error, no DB call; success → `revalidatePath('/horizon/money-out')` |
| jsdom | `ObligationList.test.tsx`, `CapTracker.test.tsx`, `CategoryShareBar.test.tsx`, `ScheduleEditor.test.tsx` (moved) | Covered-period label renders correctly; cap tracker shows planned vs actual and an over-cap state; share bar renders proportional shares; the schedule editor still works unmodified for income after generalization |
| pgTAP | `supabase/tests/database/horizon_obligations.sql`, `_obligation_schedules.sql`, `_daily_expenses.sql`, `_one_off_events.sql` | Member reads/writes own household; non-member reads zero rows; check constraints reject a bad category/currency/cadence/direction; cascade delete from account → obligation → schedules |
| Integration | `src/test/integration/horizon-spending.itest.ts` | Check constraints and FK cascades verified against real Postgres via a per-user JWT; `sumPocketExpenses` returns the correct window for a household's timezone |

Add `obligation`, `obligationSchedule`, `dailyExpense`, `oneOffEvent` factories to
`src/test/factories.ts`.

---

## 6. Delivery

Cut fresh off updated `origin/main`. One PR per slice, ordered refactor → schema → engine → UI,
the same discipline as Epics A and B.

| # | Branch / title | Contents | Status |
|---|---|---|---|
| 1 | `refactor: generalize horizon schedule engine` | `schedule.ts` moves up and takes `ScheduleRule`; shared enum tuples move to `lib/horizon/types.ts`; `ScheduleEditor` generalized; `coveredPeriod` added with tests. No new tables, no new screens — money-in must behave identically | ✅ Done (pending manual browser walkthrough) |
| 2 | `feat: add horizon obligations schema` | Migration 0020, `spending/{types,mappers,validation}`, obligation queries/mutations/actions, `gen:types`, pgTAP + integration tests. No UI | ✅ Done (pending `supabase db reset`/`gen:types`/`test:db`/`test:integration` — no local Supabase in this environment) |
| 3 | `feat: add horizon spending schema and math` | Migration 0021 (daily expenses, one-offs), their data layer, `sumPocketExpenses`, plus pure `spending-math.ts`/`hours.ts` with exhaustive unit tests. No UI | ✅ Done (pending `supabase db reset`/`gen:types`/`test:db`/`test:integration` — no local Supabase in this environment) |
| 4 | `feat: show horizon obligations` | `/horizon/money-out` real content: obligation CRUD, shared schedule editor, covered-period labels, category grouping + share bar, billable-hours column, i18n | ⏳ Not started |
| 5 | `feat: show horizon daily expenses and one-offs` | Cap tracker with Pocket actuals and 28/30/31 totals, one-off event list, on the same screen | ⏳ Not started |

Update `PLAN.md` §9 as each slice lands, and run `graphify update .` after code changes.

---

## 7. Verification

Same gate as Epics A and B:

```bash
pnpm format:check && pnpm lint && pnpm knip && pnpm typecheck && pnpm test
supabase start
supabase db reset
pnpm gen:types && git diff --exit-code apps/web/src/lib/supabase/database.types.ts
pnpm test:db
pnpm test:integration
pnpm build
```

**End-to-end, by hand:**

1. `pnpm dev`, sign in. After slice 1, open `/horizon/money-in` first and confirm income
   schedules, the 6-date preview and the struck-through slipped date all behave exactly as
   before — the refactor must be invisible there.
2. Open `/horizon/money-out` at ≥1024px. Add a rent obligation in EUR with a `dayOfMonth=28`
   schedule and `coversPeriod=next`. Confirm the row labels the covered period as the *following*
   month, and the reporting-currency figure reveals the EUR source and rate on hover (C2, C3).
3. Add a utilities obligation with `coversPeriod=previous` billed on the 20th; confirm it labels
   the *previous* month. Confirm nothing anywhere offers "spread evenly across the month" (D1).
4. Add a mortgage in RUB and a subscription in USD; confirm the category grouping and
   share-of-total bar sum to 100% in the reporting currency, and that a missing FX snapshot for
   one currency flags that row instead of silently dropping it from the chart (C7).
5. With an hourly income stream present, confirm the billable-hours column shows
   `amount ÷ blended rate` per obligation and flags when the total exceeds available working
   hours (C6).
6. Add a daily expense of 3,300/day, cadence `weekly`, with a cap set. Confirm the 28/30/31-day
   totals display, then add matching expenses in Pocket for the same category and confirm the
   cap tracker's actual figure updates to match (C4) — including that the month window agrees
   with what Pocket's own screen shows for the same period.
7. Add a one-off deposit `out` and a refund `in` roughly ten days apart; confirm both render
   visually distinct from recurring rows (C5, D7).
8. In Supabase Studio, delete the parent account for an obligation and confirm the obligation and
   its schedules cascade-delete.

---

## 8. Risks

- **Slice 1 touches shipped Epic B code.** It's behaviour-preserving by construction — the
  engine's parameter only widens structurally, and `schedule.test.ts`'s existing 24 assertions
  moving across unchanged is the proof this didn't regress anything. Doing it alone, first, in
  its own reviewable PR, is deliberate.
- **The `ScheduleEditor` generalization (slice 1) is the single biggest regression risk in the
  epic** — it's shipped, tested, working money-in UI, and this slice rewires its action plumbing
  from hardcoded `addIncomeSchedule`/`deleteIncomeSchedule` calls to injected `onAdd`/`onRemove`
  props. Mitigate by moving `ScheduleEditor.test.tsx` intact and refusing to edit its assertions —
  if they need changing, the refactor changed behaviour, which it must not.
- **Local Supabase has been unavailable in recent sessions**, so Epic B's `pnpm test:db`/
  `pnpm test:integration` have never actually run (`PLAN.md` §9). If Docker is still unavailable
  when this epic ships, it inherits that same gap — say so explicitly per slice rather than
  marking the gate green.
- **Migrations must stay backward compatible with the previous release** — release-please's
  deploy job runs `supabase db push` before `vercel deploy --prod`. Both migrations here are
  purely additive, consistent with that constraint.
