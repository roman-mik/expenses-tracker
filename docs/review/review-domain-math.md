## Domain Logic & Correctness

**Overall assessment.** The math layer is unusually disciplined for a hobby app: the formulas are isolated in one pure module (`src/lib/kapa-math.ts`), the day-count convention is written down in both the module header and PLAN.md §1, integer minor units survive end-to-end for the *stored* quantities, and month/day bucketing is timezone-aware everywhere it matters (no naive `new Date().getDate()` anywhere in the render path). The bugs that remain are not in the plumbing but in the **semantics**: (a) today is counted as *both* an elapsed day (pace, projection) and a still-spendable day (safe daily), so the hero number and the pace line disagree by exactly one day's worth of budget — a user who is told "right on pace" is simultaneously told to spend ~4.5% below their nominal daily rate; (b) `spentPct` is rounded *before* being used as the nudge trigger, so the nudge banner can announce "100% used" while the hero still says "left to spend", and at `spent == cap` it emits self-contradicting copy ("0 left, so about 0 a day carries you comfortably"); (c) `cap = 0` (a household that never set a cap, which is a legal state — `getCap` returns `null` and `capUpdateSchema` accepts `0`) puts the app permanently into the over-cap/recovery state and offers "start next month at 0"; (d) `safeDaily` is rounded with `Math.round` for display, which can advise a plan that overshoots the cap. None of these is catastrophic, but items (a)–(c) all produce *confidently wrong* statements on the primary screen, which is precisely the failure mode this product cannot afford. The existing tests are readable and genuinely exercise the timezone/DST logic, but for the derived values they largely re-assert the implementation with clean-dividing numbers; none of them pins cross-formula reconciliation, and none covers `cap = 0`.

### Intended semantics (per PLAN.md)

PLAN.md §1 states the formulas verbatim and then adds a convention paragraph that the code follows exactly:

| Value | Stated formula | Implementation |
|---|---|---|
| Remaining | `max(cap − spent, 0)` | `kapa-math.ts:148` ✅ |
| Elapsed days | `daysInMonth − daysLeft` (first day → 1, last day → D) | `kapa-math.ts:140` ✅ (clamped ≥1) |
| Safe daily | `remaining / max(daysLeft + 1, 1)` — "today is still spendable" | `kapa-math.ts:153` ✅ |
| Even pace | `cap × (elapsed / daysInMonth)` | `kapa-math.ts:161` ✅ |
| Pace gap | `evenPace − spent` (positive = under pace) | `kapa-math.ts:171` ✅ |
| Projection | `(spent / elapsed) × daysInMonth` | `kapa-math.ts:176` ✅ |
| Spent % | `min(100, round(spent / cap × 100))` | `kapa-math.ts:185` ✅ |
| Overspend | `max(spent − cap, 0)` | `kapa-math.ts:191` ✅ |
| Recovery cap | "a reduced next-month cap suggestion computed from overspend" | `kapa-math.ts:200` — implemented as `max(cap − overspend, 0)` |

`daysLeft` is defined as whole days remaining **excluding today** (`0 .. D−1`), matching the "N days until reset" countdown (`kapa-math.ts:126-133`). Design voice: *never scold*; over-cap softens instead of blocking (PLAN.md §1 "Design principle").

So the code is a faithful transcription of the plan. **The findings below are therefore mostly bugs in the plan's semantics that the code inherited**, plus a few genuine implementation defects at the render layer.

Worked baseline used throughout — **cap 30 000, spent 10 000, the 10th of a 31-day month**:

```
daysLeft   = 31 − 10        = 21     kapa-math.ts:132
elapsed    = 31 − 21        = 10     kapa-math.ts:144
remaining  = 30000 − 10000  = 20000  kapa-math.ts:149
safeDaily  = 20000 / 22     = 909.09 kapa-math.ts:157
evenPace   = 30000 × 10/31  = 9677.42
paceGap    = 9677.42 − 10000 = −322.58  → "about 323 over an even month"
projection = 10000/10 × 31  = 31000     → red, above the 30000 cap
spentPct   = round(33.33)   = 33
```
Every one of those individually matches what a careful human would say on the 10th (21 whole days after today; 22 spendable days including today). The problem is what they say *together* — see the first finding.

---

### Today is counted as both elapsed and remaining: pace and safe-daily are off by exactly one day relative to each other

**Severity: Medium-High** (wrong financial advice on the hero screen, every day of the month)

`elapsedDays = D − daysLeft` (`kapa-math.ts:144`) treats today as **fully elapsed**, while `safeDaily = remaining / (daysLeft + 1)` (`kapa-math.ts:157`) treats today as **fully still ahead**. The two spans sum to `elapsed + (daysLeft + 1) = D + 1` — one day more than the month has. Both conventions are individually defensible; holding them simultaneously is not, and `getSummary` feeds both into the same card (`summary.ts:82,91,94`, rendered together in `page.tsx:118-144`).

Concrete counterexample — cap 30 000, 31-day month, the 10th, user spending *exactly* the even pace:

```
spent      = 9677          (evenPace on day 10)
paceGap    = 9677 − 9677 = 0        → PaceLine: "Right on an even pace for the month."
remaining  = 20323
safeDaily  = 20323 / 22  = 923.8    → hero: "924 safe a day"
nominal    = cap / D     = 967.74
```
The app tells the user they are *exactly* on pace and, in the same breath, that their safe daily is **4.5% below the nominal cap/day**. Both cannot be true. The self-consistent numbers are either:

- if `spent` already includes today's spending (which it does — today's expenses are in the window): `safeDaily = 20323 / 21 = 967.8` ✅ equals nominal, or
- if today is still to be spent: `evenPace` should use 9 completed days = `30000 × 9/31 = 8710`, and the user is 967 *ahead* of pace.

Because `safeDaily`'s `+1` is load-bearing for the last day (`daysLeft = 0` → divide by 1, spend it all today — correct), the fix belongs on the pace/projection side:

```ts
/** Days fully completed before today: 0 .. D-1. */
export function completedDays(D: number, daysLeftValue: number): number {
  return Math.max(D - daysLeftValue - 1, 0);
}
export function evenPace(cap: number, completed: number, D: number): number {
  return D > 0 ? (cap * completed) / D : 0;
}
```
Check it reconciles on every day of the month: a user who has spent exactly `evenPace` has `remaining = cap × (D − completed)/D` and `daysLeft + 1 = D − completed` spendable days, so `safeDaily = cap/D` exactly — every day, including the last (`completed = 30`, `remaining = cap/31`, 1 day left → `cap/31` ✅) and the first (`completed = 0`, `evenPace = 0`, `safeDaily = cap/31` ✅).

Trade-off to decide deliberately: with `completed`, day 1 has `evenPace = 0`, so any day-1 spend renders the "a touch ahead of pace" copy. That is arithmetically honest but reads cool on day 1. If the warm voice must win, use a **fractional** elapsed day (`completed + fractionOfTodayElapsedInTz`) rather than reverting to the off-by-one — that also fixes the projection bias below. What must *not* stay is the current state where the two headline numbers silently disagree by one day.

### `Math.round(safeDaily)` can advise a plan that busts the cap

**Severity: Medium** (small absolute error, but it breaks the app's one promise)

`safeDaily` returns a float (`kapa-math.ts:157`) and every renderer rounds half-up: hero `page.tsx:121-124`, nudge `NudgeBanner.tsx:29`, chart aria label `DailySpendChart.tsx:27`.

Counterexample — cap 30 000, spent 29 001, second-to-last day (`daysLeft = 1`, 2 spendable days):

```
remaining = 999
safeDaily = 999 / 2 = 499.5
displayed = Math.round(499.5) = 500      ← page.tsx:122
following the advice: 500 + 500 = 1000 > 999  → user ends 1 over the cap
```
An allowance must floor, never round: `Math.floor(safeDaily)` → 499, and 499 × 2 = 998 ≤ 999 ✅. Better still, round **at the source** so the API and every renderer agree:

```ts
export function safeDaily(remainingValue: number, daysLeftValue: number): number {
  return Math.floor(remainingValue / Math.max(daysLeftValue + 1, 1)); // integer minor units
}
```
Related: `Summary.safeDaily / evenPace / paceGap / projection` are the only fractional values in an otherwise integer-minor-unit API contract (`summary.ts:91-96`); `GET /api/summary` currently ships `safeDaily: 909.0909090909091` to clients, each of which must re-derive the rounding rule. Returning integers (floor for allowances, round for projections) removes a whole class of future mobile/web drift.

### The nudge fires on a rounded percentage and can announce "100% used" while the hero says "left to spend"

**Severity: Medium-High** (self-contradicting copy on the primary screen)

`spentPct` rounds (`kapa-math.ts:187`) and `page.tsx:58` uses that rounded value as the trigger: `summary.spentPct >= summary.nudgePct`. Two defects follow.

*(a) Threshold fires early.* cap 100 000, spent 79 500, nudge at 80% → `round(79.5) = 80` → banner fires at 79.5% of cap. Compare raw: `spent * 100 >= nudgePct * cap`.

*(b) Contradictory copy at the top of the range.* The nudge band is `nudgePct ≤ pct ≤ 100` **and** `overspend == 0`, i.e. it includes `spent == cap`:

```
cap = 30000, spent = 30000, the 10th (daysLeft = 21)
isOver   = overspend > 0 = false          page.tsx:56
isNudge  = spentPct(100) >= 80 = true     page.tsx:58
remaining = 0, safeDaily = 0
```
renders NudgeBanner: **"100% used — heads up, you're getting close. 0 left, so about 0 a day carries you comfortably to the reset."** and below it PaceLine: *"Nicely paced — you're 19 677 under an even month. Nothing to fix today."* (paceGap = 9677 − 30000 … actually negative here; at `spent == cap` on day 10 paceGap = −20 323 → "about 20 323 over an even month"), while the hero reads "Left to spend **0**". Three components, three different emotional readings of the same state.

Fix: introduce an explicit `atCap` state (`spent >= cap && overspend == 0`) that renders the recovery/reset reassurance rather than "you're getting close", and gate the nudge on `spent < cap` in addition to the threshold:

```ts
const isOver  = summary.spent > summary.cap;
const isAtCap = summary.cap > 0 && summary.spent === summary.cap;
const isNudge = !isOver && !isAtCap && summary.nudgeEnabled &&
                summary.spent * 100 >= summary.nudgePct * summary.cap;
```
Note the nudge copy also hardcodes the assumption that `remaining/safeDaily` are meaningful; with the floor fix above, `safeDaily` is 0 whenever `remaining < daysLeft + 1`, so any spend within `daysLeft` minor units of the cap produces "about 0 a day carries you comfortably" — the guard above is what prevents it.

### `cap = 0` puts a brand-new household permanently in the over-cap recovery state

**Severity: High** (worst-first-impression bug; reachable with zero user error)

`budget_settings` is optional — `getCap` returns `null` when absent (`cap.ts:20`) and `getSummary` coerces to `0` (`summary.ts:47`). `capUpdateSchema` also accepts `monthlyCap: 0` (`validation.ts:26`). With `cap = 0` and any spend:

```
cap = 0, spent = 1200, the 10th
spentPct   = 100                      kapa-math.ts:186 (cap===0 && spent>0)
overspend  = max(1200 − 0, 0) = 1200
isOver     = true                     page.tsx:56
hero       → "Over budget by 1.200"
recoveryCap = max(0 − 1200, 0) = 0
suggestReducedCap = (0 >= 0 * 0.5) = true      RecoveryPlan.tsx:34
RecoveryPlan → "You're over by 1.200 this month… Want to even out?
                Start next month at 0 and you're right back on track"
```
A user who has simply not set a cap yet is told they are over budget and advised to adopt a cap of **0**. Two independent fixes, both wanted:

1. `page.tsx` should treat `cap <= 0` as a distinct "no cap set yet" state (hero → total spent + a "Set your cap" CTA), suppressing SpentBar %, PaceLine, ProjectionCard, NudgeBanner and RecoveryPlan entirely. `evenPace`, `paceGap`, `projection` vs `cap` are all meaningless at `cap = 0`.
2. `RecoveryPlan.tsx:34` must guard the divisor-free comparison: `const suggestReducedCap = cap > 0 && recoveryCap >= cap * MIN_SUGGESTION_FRACTION;` — otherwise `0 >= 0` is vacuously true. (Independently: `overspend >= cap` already floors `recoveryCap` at 0, and `0 >= cap*0.5` is false for `cap > 0`, so the `MIN_SUGGESTION_FRACTION` guard does the right thing everywhere except `cap = 0`.)

Also consider forcing cap setup at onboarding, since PLAN.md §1 makes the cap the single organizing concept.

### Projection is volatile early in the month, and disappears exactly when the user needs it

**Severity: Medium**

`projection = (spent / elapsed) × D` (`kapa-math.ts:181`). `ProjectionCard` suppresses it below 3 elapsed days (`ProjectionCard.tsx:10,23`), which handles days 1–2 but not the instability that persists well past that:

```
cap = 30000, 31-day month, one 12 000 rent-ish expense on the 1st, nothing since.
Day 3:  projection = 12000/3  × 31 = 124 000   → "At this rate, month-end lands near 124.000" (red)
Day 4:  projection = 12000/4  × 31 =  93 000
Day 7:  projection = 12000/7  × 31 =  53 143
Day 15: projection = 12000/15 × 31 =  24 800   (green)
```
A 4× overshoot on day 3 collapsing to under-cap by day 15, from a single unchanged expense. Per the app's own voice ("a scary early number would read as scolding" — `ProjectionCard.tsx:6-9`), the 3-day guard does not achieve its stated goal. Compounding it, the same off-by-one as above biases the denominator: at 09:00 on day 3 only ~2.4 days have truly elapsed, so the divisor is 25% too large.

Recommended: shrink the run rate toward the even pace with a confidence weight, so early days lean on the cap and late days lean on observed behaviour:

```ts
export function projection(spent: number, elapsedFractional: number, D: number, cap: number, k = 4): number {
  const e = Math.max(elapsedFractional, 0.5);
  const observed = spent / e;                  // minor units per day
  const w = e / (e + k);                       // 0 → trust cap, 1 → trust observed
  const rate = w * observed + (1 - w) * (cap / D);
  return Math.round(spent + rate * (D - e));
}
```
On the example above: day 3 → ≈ 12 000 + (0.43·4000 + 0.57·968)·28 ≈ 74 700 (still a warning, far less absurd); day 15 → ≈ 25 300. Alternatively keep the raw formula but clamp the *displayed* value and say "on track to run out around <date>", which is the question the user actually has.

Separately: `ProjectionCard` renders only in the `!isOver` branch (`page.tsx:139-151`), so the moment the user goes over the cap the "where will I land" answer vanishes — precisely when the landing spot matters most. The over-cap branch has no forward-looking number at all (see next finding).

### The recovery plan answers a different question than PLAN.md promises, and never gives a daily number

**Severity: Medium** (product-correctness, not arithmetic)

PLAN.md §1 describes the over-cap state as: *"soft warning + recovery plan: 'hold N days to X/day and next month starts clean'"* — i.e. a **rest-of-this-month daily allowance**. What ships is a **next-month cap suggestion** (`recoveryCap = max(cap − overspend, 0)`, `kapa-math.ts:200`) plus the day count, with no `X/day` anywhere (`RecoveryPlan.tsx`, `messages/en.json` `RecoveryPlan.*`). The arithmetic that *is* there is correct — cap 100 000, overspend 4 200 → 95 800, and the two months net even ✅ — but the "hold N days to X/day" number is simply absent, and `safeDaily` is 0 in this state (because `remaining` floors at 0, `kapa-math.ts:149`), so nothing fills the gap.

Also note `daysLeft` in the copy: *"in {daysLeft} days the reset wipes the slate clean"* with `daysLeft = 0` correctly collapsing to "the reset wipes the slate clean" on the last day (plural `=0` branch in `messages/en.json`) ✅ — that edge case is handled.

If the plan's copy is still wanted, the honest number is a *hold-the-line* allowance: `holdDaily = 0` is the only value that stops the overspend growing, so the useful framing is either the next-month cap (what shipped) or "spend nothing more and you finish 4 200 over" — worth an explicit product decision rather than silent divergence from the plan.

### Category breakdown percentages do not sum to 100

**Severity: Low** (cosmetic, but visible)

`CategoryBreakdown.tsx:46` rounds each share independently: `Math.round((spent / total) * 100)`.

```
three categories, 1 000 each → 33% + 33% + 33% = 99%
categories 10, 10, 1 (total 21) → 48% + 48% + 5% = 101%
```
Fix with largest-remainder (Hamilton) apportionment so the displayed shares sum to exactly 100:

```ts
function apportion(values: number[], total: number): number[] {
  const raw = values.map(v => (v / total) * 100);
  const floors = raw.map(Math.floor);
  let rest = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - floors[i], i] as const).sort((a, b) => b[0] - a[0]);
  const out = [...floors];
  for (const [, i] of order) { if (rest-- <= 0) break; out[i] += 1; }
  return out;
}
```
(The flex-grow bar above it uses raw `spent` values, so the *bar* is exact — only the legend drifts.)

### "Yesterday" is mislabelled on the day after a DST spring-forward

**Severity: Low**

`history/page.tsx:56-59` computes yesterday as `now − 86 400 000 ms`, which is a fixed 24 hours, not a calendar day.

```
Belgrade, 2026-03-30 00:30 local (CEST, +02) = 2026-03-29T22:30Z
minus 24h                                    = 2026-03-28T22:30Z
                                             = 2026-03-28 23:30 CET
yesterdayKey = '2026-03-28'   ← wrong; yesterday is 2026-03-29
```
Consequence for the first hour of the day after spring-forward: Mar 29's group renders as "Sun, 29 Mar" instead of "Yesterday", and Mar 28's group is labelled "Yesterday". Fix by decrementing the *calendar* day in the household timezone rather than subtracting a fixed duration — e.g. derive `todayKey`, then compute the previous key from `monthWindow`-style zoned arithmetic, or subtract 24h from *local noon*:

```ts
const noonUtc = new Date(new Date(`${todayKey}T12:00:00Z`).getTime() - 86_400_000);
const yesterdayKey = zonedDateKey(noonUtc, timeZone); // noon anchor is DST-proof
```
Everything else in the JS day-bucketing layer is correct on a UTC server: `zonedDateKey` formats through `Intl` with an explicit `timeZone` (`date.ts:8-16`), `dailyTotals` builds its keys from the `month` string and matches against zoned keys (`date.ts:32-42`), the expense set is already windowed by the same timezone (`expenses.ts:30-34`), and `todayKey` for the chart's highlight comes from the same helper (`page.tsx:49`). I could not construct a case where an expense lands in the wrong day bucket.

### Requesting a future month via `/api/summary` yields nonsense-but-plausible numbers

**Severity: Low** (API-only; the web UI always passes `currentMonth`)

`monthParamSchema` accepts any valid `YYYY-MM` (`validation.ts:12-14`), and `daysLeft` returns `D` for a month that has not started (`kapa-math.ts:129`). Then `elapsedDays` clamps to 1 (`kapa-math.ts:144`) even though **zero** days have elapsed:

```
GET /api/summary?month=2027-01, cap = 30000
daysLeft  = 31, elapsed = 1 (should be 0)
safeDaily = 30000 / 32 = 937.5     ← divides by 32 days in a 31-day month
evenPace  = 30000 × 1/31 = 967.74  ← "you should already have spent 968" in a month that hasn't begun
paceGap   = +967.74                 → "Nicely paced — you're 968 under an even month"
```
Either reject future months at the route, or special-case "month not started": `elapsed = 0`, `safeDaily = cap / D`, `evenPace = 0`, `projection = 0`.

### Edge cases: verified good, and the two gaps

**Severity: Informational**

Verified correct by construction:
- **No expenses** — `spent = 0`, `remaining = cap`, `spentPct = 0`, `projection = 0`, breakdown empty (`CategoryBreakdown` returns `null` at `total === 0`, line 20) ✅
- **Expense larger than the cap** — `overspend` and `recoveryCap` floor correctly; `recoveryCap = 0` with the `MIN_SUGGESTION_FRACTION` guard suppressing the punitive suggestion ✅
- **Feb / 29 Feb / 30 vs 31 days** — `daysInMonth` uses `Date.UTC(y, m+1, 0)` (`kapa-math.ts:119`), correct for leap years, and every formula takes `D` as a parameter ✅
- **Concurrent adds by two household members** — each request re-aggregates server-side over the whole household pool (`summary.ts:51-56`); no read-modify-write, so no lost updates ✅
- **Negative / refund amounts** — impossible: `amountMinor` is `int().nonnegative()` (`validation.ts:17`). This is *safe* but means a mistaken expense can only be deleted, never offset; worth a product decision if refunds are expected.
- **Household created mid-month** — no proration. A household created on the 25th of a 31-day month sees `evenPace = 25/31 × cap` ("you're 80% of your cap under pace!") and `safeDaily = cap/7`, i.e. it invites ~4.4× the nominal daily rate. Arithmetically consistent with "one cap per calendar month", but if a real first month is expected to be partial, the cap should be prorated by `(D − joinDom + 1)/D` for that month only.

### Attribution: nothing to reconcile

**Severity: Informational**

`attribution.ts` is purely a **display label** (`"you"` / display name / `"partner"`), not a split of the household total — no per-member share math exists anywhere in the codebase, so "shares failing to sum to the household total" is not a live risk. The whole household pool feeds one cap (`summary.ts:50-56`), which matches PLAN.md §3 ("the household is the unit of ownership"). Two non-math notes: the `'partner'` fallback is a hardcoded English literal in an otherwise fully localized app (`attribution.ts:10`), and in a 3+ member household every unknown member renders as the same "partner", which is ambiguous rather than wrong.

### Float artifacts in the derived values

**Severity: Low** (sub-minor-unit, cosmetic)

`evenPace` computes `cap * (elapsed / D)` (`kapa-math.ts:167`) rather than `(cap * elapsed) / D`. Across all `(cap, elapsed, D)` combinations tested, 155 pairs differ in the last ULP (e.g. `cap=100000, elapsed=1, D=28` → `3571.428571428571` vs `3571.4285714285716`). The difference is far below one minor unit and cannot change a displayed figure, but reordering to `(cap * elapsed) / D` is free and keeps exactness whenever `D` divides `cap * elapsed`. It also makes the `paceGap === 0` "Right on an even pace" branch (`PaceLine.tsx:34`) reachable more predictably — today it fires essentially only when `elapsed === D`.

---

## Missing test cases

`kapa-math.test.ts` is thorough on `daysInMonth`, `monthWindow` (including the Belgrade DST crossing) and `daysLeft` — those are genuinely good tests. The derived-value tests, however, use numbers chosen to divide cleanly (`safeDaily(64000, 15) === 4000`, `evenPace(100000, 15, 30) === 50000`, `projection(60000, 15, 30) === 120000`) and therefore re-assert the implementation rather than pin the semantics. Specifically missing:

1. **Cross-formula reconciliation** (would have caught the headline bug): for every day `1..D`, assert that a user who has spent exactly `evenPace` gets `safeDaily === cap / D`. Currently fails on every day.
2. **`elapsed + spendableDays === D`** as an invariant test over all `daysLeft` in `0..D-1`. Currently yields `D + 1`.
3. **`safeDaily` never overshoots**: `floor(safeDaily) * (daysLeft + 1) <= remaining` — e.g. `safeDaily(999, 1)` must not render as 500.
4. **`cap = 0` end-to-end** in `summary.test.ts`: no `budget_settings` row + one expense → assert the app does *not* report "over budget" / suggest a 0 cap.
5. **Nudge boundary as a raw comparison**: `cap = 100000, spent = 79500, nudgePct = 80` must **not** trigger; `spent = 80000` must. Also `spent === cap` must render the at-cap state, not "you're getting close".
6. **`spentPct` rounding vs. trigger**: assert `spentPct(99900, 100000) === 100` *and* that the UI still says "left to spend" — i.e. the display/trigger split.
7. **Projection stability**: a single day-1 expense evaluated on days 3, 4, 7, 15 — assert the projection moves less than some bound, or that it is suppressed.
8. **Future / past month in `getSummary`**: `month` after the current month → `elapsed === 0`, `evenPace === 0`, `projection === 0`; past month → `daysLeft === 0`, `elapsed === D`, `projection === spent`.
9. **Category percentages sum to 100** for `[1000,1000,1000]` and `[10,10,1]` (component-level test of `CategoryBreakdown`).
10. **`dailyTotals` / `dayLabel` across a DST transition**: an expense at 2026-03-29 02:30 Belgrade and a "yesterday" evaluation at 2026-03-30 00:30 local. `daily-totals.test.ts` covers the Belgrade offset but never a transition day, and `dayLabel` has no test at all.
11. **`daysLeft` on the last day at 23:59 local** (`daysLeft === 0`, `safeDaily === remaining`) and at 00:00 local on the 1st (`daysLeft === D-1`) — the boundary instants, not mid-day 09:00 as every current test uses.
12. **Currency-mixing regression** for the known merged-household issue (`summary.ts:65-78`): an expense in a foreign currency must appear in `otherCurrencies` *and* the UI must surface that the cap math excludes it (`hasOtherCurrencies` exists on `/history` but not on Home).

## What's done well

- **One pure math module.** `kapa-math.ts` has no I/O, takes `now` and `timeZone` as parameters, and is shared by both the Server Component and `/api/summary` (`summary.ts:29-34`, `route.ts:16-20`) — the web and future mobile clients literally cannot drift. This is the single best structural decision in the codebase.
- **The day-count convention is written down.** Both `kapa-math.ts:7-17` and PLAN.md §1 explain *why* the `+1` lives on `safeDaily`'s denominator and not on `elapsedDays`. Even though I believe the resulting pair is inconsistent, the author reasoned about the last-day/first-day tension explicitly and documented the trade — that made this review possible in the first place.
- **Timezone discipline at the JS layer.** Every "what day is it" question routes through `Intl` with an explicit household timezone (`zonedParts`, `zonedDateKey`), and `now` is injected rather than read ambiently, so a UTC Vercel server behaves identically to a local one. The DST-refinement pass in `zonedMidnightToUtc` (`kapa-math.ts:83-85`) is a detail most implementations miss.
- **Integer minor units for stored values**, with `format.ts` explicitly documented as display-only ("never use this for arithmetic") and `CURRENCY_EXPONENT` isolated to formatting.
- **Currency is never mixed silently.** `getSummary`, `categoryBreakdown` and `dailyTotals` all apply the same active-currency filter and the `/history` breakdown surfaces an explicit "other currencies" note — a coherent, deliberate v1 stance rather than an accidental one.
- **Genuinely well-tested timezone logic.** The DST-crossing `monthWindow` test and the local-midnight `daysLeft` test are the kind of cases that usually only appear after a production incident.
- **The design voice is enforced in code, not just copy.** `MIN_ELAPSED_DAYS` suppressing early projections and `MIN_SUGGESTION_FRACTION` suppressing a punitive recovery cap are both cases of a product principle ("never scold") being encoded as an actual guard with a comment explaining the intent.
