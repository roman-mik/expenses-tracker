# Horizon Epic B — Income

**Status:** all 3 slices shipped · **Spec:** `docs/horizon-user-stories.md` §5 Epic B · **Plan of record:** `PLAN.md` §9

---

## 1. Context

Epic A (accounts, reporting currency, FX snapshots) is shipped. Epic B is the first piece of
the actual cashflow model: it lets a user describe *where money comes from* — an hourly rate
against a work calendar, or a fixed amount — and *when* it arrives, as a generated schedule
rather than a typed date.

**Scope for this pass: B1–B4 only.** B5 ("toggle any stream on/off within a scenario, compare
both futures side by side") depends on the `Scenario`/`ScenarioDiff` model from Epic E, which
doesn't exist yet. The spec's own suggested build order (§6) already separates these — B1–B4
sit in Phase 1 (Foundation) with B5 paired to E1–E3 in Phase 3 (Interaction). Building a
scenario toggle now would mean inventing throwaway plumbing Epic E will redo properly. B6–B7
stay `[P2]`, deferred.

**Decisions taken (this session):**

| Question | Decision |
|---|---|
| Scope | B1–B4 only. B5 waits for Epic E; B6–B7 stay P2 |
| Work calendar | One calendar per household (not the spec's multi-calendar model) — a household has one set of working weekdays and holidays, not several named calendars. `plannedTimeOff` is B7 (P2), not built here |
| Schedule storage | A child table (`horizon_income_schedules`), since B2 requires multiple schedules per stream ("the 15th **and** month end") — flat columns on the stream can't hold that |
| `coversPeriod` | Column kept on the schedule table for schema symmetry with Epic C's `Obligation` reuse later, defaulted to `'same'` and untested here — B's stories never exercise it (that's C2) |
| `kind: variable` | Schema keeps the 3-way `hourly \| fixed \| variable` enum from the spec, but only `hourly` gets real derived-amount math this pass; `fixed` and `variable` both just store/use a flat amount until something differentiates them |

**Non-goals:** the projection engine (Epic D), scenarios (Epic E), obligations (Epic C — a
separate `Schedule`-shaped concept will likely reuse this table's shape, not this table
itself, since it's `income_stream_id`-scoped). Any of those appearing in this work is scope
creep.

---

## 2. Data model

Two additive migrations.

### 2a. `supabase/migrations/0018_horizon_work_calendar.sql`

```sql
create table public.horizon_work_calendars (
  household_id      uuid primary key references public.households(id) on delete cascade,
  working_weekdays  int[] not null default '{1,2,3,4,5}',  -- 0=Sun .. 6=Sat, ISO-ish but 0-based
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint horizon_work_calendars_weekdays_valid
    check (working_weekdays <@ array[0,1,2,3,4,5,6])
);

create table public.horizon_holidays (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  date          date not null,
  name          text not null,
  constraint horizon_holidays_unique unique (household_id, date)
);
create index horizon_holidays_household_idx on public.horizon_holidays (household_id, date);
```

One calendar row per household, created lazily (first read materializes the default via
`upsert`, same pattern as `getHousehold`'s fallback) rather than seeded by a trigger — simpler,
and avoids a migration backfill loop over existing households.

### 2b. `supabase/migrations/0019_horizon_income_streams.sql`

```sql
create table public.horizon_income_streams (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households(id) on delete cascade,
  account_id        uuid not null references public.horizon_accounts(id) on delete cascade,
  name              text not null,
  kind              text not null,                    -- hourly | fixed | variable
  currency          text not null,
  hourly_rate_minor bigint,                            -- kind = hourly
  hours_per_day_e2  int,                                -- kind = hourly; ×100, e.g. 800 = 8.00h
  fixed_amount_minor bigint,                            -- kind = fixed | variable
  recurrence        text not null default 'recurring', -- recurring | oneOff
  confidence        text not null default 'confirmed', -- confirmed | expected | uncertain
  taxable           boolean not null default true,
  start_date        date not null,
  end_date          date,
  sort_order        int not null default 0,
  archived          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint horizon_income_streams_kind_allowed
    check (kind in ('hourly','fixed','variable')),
  constraint horizon_income_streams_currency_allowed
    check (currency in ('RSD','EUR','USD','RUB')),
  constraint horizon_income_streams_recurrence_allowed
    check (recurrence in ('recurring','oneOff')),
  constraint horizon_income_streams_confidence_allowed
    check (confidence in ('confirmed','expected','uncertain')),
  constraint horizon_income_streams_name_len
    check (char_length(btrim(name)) between 1 and 60),
  -- exactly the fields its kind needs, nothing left silently unused
  constraint horizon_income_streams_hourly_fields check (
    (kind = 'hourly' and hourly_rate_minor is not null and hours_per_day_e2 is not null
       and fixed_amount_minor is null)
    or (kind in ('fixed','variable') and fixed_amount_minor is not null
       and hourly_rate_minor is null and hours_per_day_e2 is null)
  )
);
create index horizon_income_streams_household_idx
  on public.horizon_income_streams (household_id, sort_order);

create table public.horizon_income_schedules (
  id                uuid primary key default gen_random_uuid(),
  income_stream_id  uuid not null references public.horizon_income_streams(id) on delete cascade,
  kind              text not null,   -- dayOfMonth | monthEnd | everyNDays | nthWeekday | oneOff
  day_of_month      int,             -- kind = dayOfMonth
  interval_days     int,             -- kind = everyNDays
  nth_weekday       int,             -- kind = nthWeekday; 1st..5th
  weekday           int,             -- kind = nthWeekday; 0=Sun..6=Sat
  anchor_date       date,            -- kind = everyNDays | oneOff
  slippage_policy   text not null default 'nextBusinessDay',
  covers_period     text not null default 'same',
  created_at        timestamptz not null default now(),
  constraint horizon_income_schedules_kind_allowed
    check (kind in ('dayOfMonth','monthEnd','everyNDays','nthWeekday','oneOff')),
  constraint horizon_income_schedules_slippage_allowed
    check (slippage_policy in ('nextBusinessDay','prevBusinessDay','none')),
  constraint horizon_income_schedules_covers_allowed
    check (covers_period in ('same','next','previous')),
  constraint horizon_income_schedules_day_of_month_range
    check (day_of_month is null or day_of_month between 1 and 31)
);
create index horizon_income_schedules_stream_idx
  on public.horizon_income_schedules (income_stream_id);
```

RLS/grants/`updated_at` trigger: same treatment as Epic A — four policies gated on
`is_household_member(household_id)` on every table. `horizon_income_schedules` denormalizes
`household_id` onto the row (rather than joining through `income_stream_id`), same precedent
as `horizon_balance_snapshots` (0016) denormalizing off `horizon_accounts` instead of joining —
keeps every policy a direct check, no subqueries.

---

## 3. Application layers

```
apps/web/src/lib/horizon/
  income/
    types.ts        IncomeStream, IncomeSchedule, WorkCalendar, Holiday, ScheduleKind, etc.
    mappers.ts       toIncomeStream, toIncomeSchedule, toWorkCalendar
    validation.ts    Zod schemas
    schedule.ts      PURE. generateDates, applySlippage, isWorkingDay, workingDaysBetween
    schedule.test.ts
    income-math.ts   PURE. hourlyIncomeForPeriod, annualizedIncome (excludes one-offs by default)
    income-math.test.ts
  queries/income.ts        streams + their schedules + work calendar + holidays
  mutations/income.ts      stream CRUD, schedule CRUD, calendar/holiday upsert
apps/web/src/app/actions/
  horizon-income.ts
```

Reuse exactly as Epic A's plan lists (`Currency`/`Money`/`CURRENCIES`, `formatMoney`,
`verifySession`/`getHouseholdId`, `createClient`, `reportError`, the shared `ActionResult`
type, the mutation/action shape from `categories.ts`).

### `lib/horizon/income/schedule.ts` — the new pure engine

This is this epic's `fx.ts` — no I/O, no `Date.now()`, deterministic, dates passed in.

```ts
generateDates(schedule, calendar, { from, to }): string[]
// Expands a schedule rule into concrete YYYY-MM-DD dates within [from, to].
// dayOfMonth: that day each month, clamped to the month's actual length
//   (day_of_month=31 in a 30-day month → the 30th, not a skip — document this).
// monthEnd: the actual last calendar day of each month.
// everyNDays: anchor_date + n, 2n, 3n, ... — NOT "the 1st, 1+n, 2+n of each month".
// nthWeekday: e.g. "3rd Friday" — clamp/skip a 5th occurrence that doesn't exist
//   rather than erroring (document the choice; test it).
// oneOff: exactly anchor_date, or [] if outside the range.

applySlippage(date, calendar, policy): string
// policy='none' → unchanged. next/prevBusinessDay walk forward/back over
// isWorkingDay until it lands on one — weekends AND horizon_holidays both count.

isWorkingDay(date, calendar): boolean
nextSixDates(schedule, calendar, from): { date, shifted, originalDate? }[]
// Powers B2/B3's preview UI directly — original date struck through when
// slippage actually moved it (B3's acceptance criterion).
```

### `lib/horizon/income/income-math.ts`

Refined during implementation — `annualizedIncome` sums the actual 12 months of a given
`year` rather than a flat "monthly amount × 12", and `monthlyIncomeForStream` takes the
stream's schedules so a fixed/variable stream paid twice a month (or quarterly) isn't
silently treated as once/month:

```ts
hourlyIncomeForPeriod(rateMinor, hoursPerDay, workingDaysInPeriod): Money
// rateMinor × hoursPerDay × workingDaysInPeriod, rounded half-up (same
// discipline as fx.ts's convert()).

workingDaysInMonth(month, calendar): number
// Feeds B1's "a month with fewer working days shows lower income
// automatically" — derived from the calendar, never hand-entered.

monthlyIncomeForStream(stream, schedules, month, calendar): Money
// hourly: workingDaysInMonth() × hourlyIncomeForPeriod(), independent of
// payment schedule (D9). fixed/variable: fixedAmountMinor × the count of
// that stream's schedule occurrences actually falling in the month
// (via schedule.ts's generateDates), not assumed to be 1.

annualizedIncome(streams, schedules, calendar, year, { includeOneOff }): Money
// Sums monthlyIncomeForStream() across all 12 months of `year` for every
// non-archived stream; one-offs excluded unless includeOneOff (B4's toggle).
```

---

## 4. Screens

| Route | Content | Stories |
|---|---|---|
| `/horizon/money-in` (real content, replaces `HorizonPlaceholder`) | Stream list grouped by kind, each row showing recurrence + confidence badges and the derived per-payment/per-month amount; hourly calculator (rate × hours/day × calendar → live derived figure); schedule editor per stream (rule picker, slippage policy, next-6-dates preview with struck-through original on shift) | B1, B2, B3, B4 |
| `/horizon/assumptions` (extended) | New "Work calendar" section: working-weekday picker, holiday list (add/remove, name + date) | B1 (feeds the calendar the calculator uses) |

**Components** (new, under `apps/web/src/components/horizon/`):
`money-in/{IncomeStreamList,IncomeStreamForm,HourlyCalculator,ScheduleEditor,SchedulePreview}.tsx`,
`assumptions/WorkCalendarEditor.tsx`.

Reuse `Button`, `PageHeader`/`PageLoadingShell`, `useToast()`, the `CURRENCY_EXPONENT`
major↔minor pattern from `AddExpenseForm.tsx`, and the radiogroup-style pickers already
established for account type/currency (`AccountForm.tsx`) for `kind`/`recurrence`/`confidence`.

**i18n:** add `Horizon.moneyIn.*` (replacing/extending the placeholder's key) and
`Horizon.assumptions.workCalendar.*` to **both** `en.json` and `ru.json` —
`src/test/messages.test.ts` fails CI on key drift.

---

## 5. Tests

| Layer | Files | What it must prove |
|---|---|---|
| Unit (node) | `lib/horizon/income/schedule.test.ts` | Every `kind` generates correct dates across month-length edge cases (Feb, 31-day clamp, 5th-weekday-doesn't-exist); slippage over a weekend and over a holiday; `applySlippage('none')` is a no-op |
| Unit (node) | `lib/horizon/income/income-math.test.ts` | Hourly calc across differing calendars; a month with fewer working days yields less income with no manual edit (B1's own acceptance criterion, made literal); annualized total excludes one-offs by default |
| Unit (node) | `queries/mutations/income.test.ts` | CRUD + household scoping via `fake-supabase.ts`/`factories.ts`; a stream's schedules cascade-delete with it |
| Unit (node) | `app/actions/horizon-income.test.ts` | Unauthenticated → error; bad input → error, no DB call; success → `revalidatePath('/horizon/money-in')` |
| jsdom | `IncomeStreamList.test.tsx`, `ScheduleEditor.test.tsx`, `HourlyCalculator.test.tsx`, `WorkCalendarEditor.test.tsx` | Rendering, live-recompute on input change, the 6-date preview with a struck-through shifted date |
| pgTAP | `supabase/tests/database/horizon_income_streams.sql` (+ `_schedules`) | Member reads/writes own household; non-member reads zero rows; the `hourly`/`fixed` field-presence check constraint rejects a mismatched row; cascade delete from stream → schedules and from account → stream |
| Integration | `src/test/integration/horizon-income.itest.ts` | Check constraints reject bad values through a real per-user JWT; cascades verified against real Postgres |

---

## 6. Delivery

Cut fresh off updated `origin/main`.

| # | Branch / title | Contents | Status |
|---|---|---|---|
| 1 | `feat: add horizon income schema` | Migrations 0018–0019, `lib/horizon/income/{types,mappers,validation}`, queries/mutations/actions, `gen:types`, pgTAP + integration tests. No UI | ✅ Done |
| 2 | `feat: add horizon schedule generation engine` | `schedule.ts` + `income-math.ts`, exhaustive unit tests. Still no UI | ✅ Done |
| 3 | `feat: show horizon income streams` | `/horizon/money-in` real content, work-calendar editor on `/horizon/assumptions`, rail unchanged (already links to `money-in`), i18n | ✅ Done |

Update `PLAN.md` §9 as each slice lands, and run `graphify update .` after code changes.

**Slice 3 notes:** `IncomeStreamList`/`IncomeStreamForm`/`ScheduleEditor` (money-in) and
`WorkCalendarEditor` (assumptions) cover B1–B4 UI in three components rather than the five
originally sketched in §4 — `HourlyCalculator` folded into `IncomeStreamForm` as a plain
rate/hours input pair (no separate live-recompute widget), and `SchedulePreview` folded into
`ScheduleEditor` (the upcoming-dates list). jsdom tests were written and pass (`format:check`,
`lint`, `knip`, `typecheck`, `pnpm test` all green, `pnpm build` succeeds) — but the by-hand
browser walkthrough in §7 was **not** run this session, since the Chrome browser-automation
tool wasn't connected in this environment. Do that pass before calling B1–B4 fully verified.

---

## 7. Verification

Same gate as Epic A:

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

1. `pnpm dev`, sign in, open `/horizon/money-in` at ≥1024px.
2. Add an hourly stream (rate, hours/day) with a `dayOfMonth=15` schedule and a `monthEnd`
   schedule on the same stream. Confirm both appear and the preview shows 6 upcoming dates
   across both rules, merged and sorted.
3. Edit the work calendar to mark a weekday non-working, or add a holiday landing on the 15th —
   confirm the 15th's occurrence shifts per the slippage policy and the struck-through original
   date shows.
4. Switch a stream's recurrence to `oneOff` and confidence to `uncertain` — confirm the visual
   badge changes and it drops out of the annualized total (toggle it back on, total updates).
5. Change the work calendar's working weekdays to fewer days — confirm the hourly stream's
   derived per-month amount drops with no other edit (B1's core promise).
6. Confirm `horizon_income_streams`/`horizon_income_schedules` rows in Supabase Studio actually
   cascade-delete when the parent account (for the stream) or stream (for its schedules) is
   deleted.
