# Personal Cashflow App — Product Spec & User Stories

Starting point for design and development. Built for one user first (multi-currency freelancer with variable income), with a data model general enough to open up later.

---

## 1. The problem

Existing budgeting apps assume a salary that arrives monthly and bills that can be averaged. That assumption breaks for anyone who:

- earns an **hourly rate against variable working days**, so income swings 160–184 hours a month while bills stay fixed
- is paid on a **schedule** (the 15th and month end) rather than "monthly"
- holds money in one currency, earns in a second, and pays obligations in a third and fourth
- has **one-off income** that must not be mistaken for recurring
- faces **timing risk** — solvent on paper every month, yet short for two days before payday

The app's job is to answer four questions precisely: *What do I have? What's coming? When does it get tight? What if I changed something?*

---

## 2. Domain rules

These are non-negotiable calculation rules. Each one exists because getting it wrong produced a materially wrong answer during manual analysis.

| # | Rule | Why it matters |
|---|---|---|
| **D1** | **Never spread a monthly total evenly across the month.** Every obligation has a real due date. | Clustering bills on one assumed date produced a phantom crisis six weeks out. Spreading them across their true dates dissolved it entirely. |
| **D2** | **Always compute the intra-month minimum, not just the month-end balance.** | A projection showed a healthy month end while the balance sat at −124,600 for two days mid-month. Month-end alone hides insolvency. |
| **D3** | **Same-day event ordering is explicit and configurable.** Income posts before outflows by default. | Whether a day goes negative can depend entirely on whether the salary or the rent lands first. |
| **D4** | **A payment date and the period it covers are separate fields.** Rent paid on the 28th covers the *following* month; utilities billed on the 20th cover the *previous* one. | Upfront vs arrears shifts real cash by a full cycle. |
| **D5** | **Payment schedules are rules, not intervals.** "The 15th and month end" = 24 payments/year. "Every 15 days" = 24.35. | The difference is a whole extra payment some years, and it changes which months are tight. |
| **D6** | **Schedule slippage is modelled.** If a payment date falls on a weekend or holiday, it moves per a configurable policy (next business day / previous / none). | A salary due the 15th arrived the 17th because the 15th was a Saturday. |
| **D7** | **Recurring vs one-off is a first-class property of every money movement, never inferred.** | A one-off bonus and a recurring rent payment arrived on the same day in the same currency. Treating the bonus as recurring overstated the annual position by 1.5M. |
| **D8** | **Confidence is modelled, not assumed.** Every stream is `confirmed`, `expected`, or `uncertain`, with an optional end date. | "Might continue, might not" is the normal state of a side income and must be projectable both ways. |
| **D9** | **Income from hours = rate × hours/day × working days in the period**, where working days are derived from a calendar, minus holidays and planned time off. | Never store income as a monthly figure. A break-even rate computed on 2,088 hours silently assumes the user never takes a day off. |
| **D10** | **Tax has a fixed component and a marginal component.** Solving for a target income must gross up the increment at the marginal rate. | With a 10% marginal rate, every 1.00 the user wants to keep costs 1.11 billed. |
| **D11** | **FX rates are stored snapshots with a date and source, never live-fetched at render time.** Projections are reproducible. | Two runs of the same projection must produce identical numbers. |
| **D12** | **Daily-accrual expenses accrue per day but may be *charged* on a different cadence.** Store the daily amount and the charge cadence separately. | Groceries at 3,300/day are a daily drain but appear as a weekly withdrawal. Both views are needed. |
| **D13** | **Scenario transitions carry their own one-off costs and refunds, each with its own date.** | A house move involves a deposit out and a deposit back, ~10 days apart. The gap between them is where the risk lives. |
| **D14** | **Every estimated value is flagged and listed in one place.** | Half the errors in manual analysis came from an assumption made once and then forgotten. |
| **D15** | **Reporting currency is a user setting; source amounts are always stored in their native currency.** Conversion happens at display and projection time. | Amounts must never be silently rewritten into another currency. |

---

## 3. Data model

```
Account            id, name, currency, currentBalance, type(business|personal|savings), includeInTotal

Currency           code, symbol, decimals
FxRate             baseCode, quoteCode, rate, asOfDate, source

WorkCalendar       id, workingWeekdays[], holidays[Date], plannedTimeOff[DateRange]

Schedule           id, kind(dayOfMonth | monthEnd | everyNDays | nthWeekday | oneOff)
                   dayOfMonth?, n?, anchorDate?
                   slippagePolicy(nextBusinessDay | prevBusinessDay | none)
                   coversPeriod(same | next | previous)

IncomeStream       id, name, kind(hourly | fixed | variable)
                   currency, accountId
                   hourlyRate?, hoursPerDay?, workCalendarId?     // kind = hourly
                   fixedAmount?                                    // kind = fixed
                   scheduleId
                   recurrence(recurring | oneOff)
                   confidence(confirmed | expected | uncertain)
                   startDate, endDate?
                   taxable(bool)

Obligation         id, name, category, amount, currency, accountId
                   scheduleId
                   recurrence, confidence
                   startDate, endDate?

DailyExpense       id, name, dailyAmount, currency
                   chargeCadence(daily | weekly | monthly)
                   cap?                                            // budget target vs actual

TaxRule            id, name
                   fixedMonthlyAmount
                   marginalRate                                    // applied to taxable income
                   appliesToStreamIds[]

Scenario           id, name, description, baseScenarioId?, isBaseline
                   effectiveFrom
                   diffs: ScenarioDiff[]

ScenarioDiff       targetType(income|obligation|dailyExpense|account)
                   targetId, effectiveFrom
                   changes: { field: newValue }
                   oneOffs: OneOffEvent[]                          // e.g. deposit out, deposit back

OneOffEvent        id, name, amount, currency, date, direction(in|out), category

Projection         (computed, not stored)
                   dailyBalances: [{date, balance}]
                   events: [{date, label, amount, kind, balanceBefore, balanceAfter}]
                   monthEnd: [{month, balance}]
                   monthMinimum: [{month, date, balance}]
                   firstNegativeDate?
                   metrics: { monthlyGap, annualGap, breakEvenRate, runwayMonths }

Assumption         id, field, value, confidence, note, lastReviewed
```

**Key relationships:** a `Scenario` is a set of diffs on the baseline, not a copy. Projections are pure functions of `(baseline + scenario diffs + date range)` and must be deterministic.

---

## 4. Screens & information architecture

| Screen | Purpose | Key components |
|---|---|---|
| **Today** | The one-glance answer: what do I have, what's the monthly position, when does it get tight | Hero balance (reporting currency), account chips, monthly surplus/deficit, next 3 events, runway indicator, warning banner if a negative day is projected |
| **Timeline** | What's coming, day by day | Daily balance line with event markers, zero-line shading, hover detail; date-range control; toggle between *balance line* and *waterfall* (each event as a bar from prior to new balance) |
| **Money in** | Manage income streams | List by stream with recurrence + confidence badges; hourly calculator showing derived monthly figure; schedule editor with slippage preview |
| **Money out** | Manage obligations and daily expenses | Grouped by category with share-of-total bar; due-date column; daily-expense cap tracker |
| **Scenarios** | Compare futures side by side | Scenario picker (multi-select up to 4); comparison table (monthly gap, first negative, end balance, break-even rate); overlaid projection charts — *month-end* and *monthly minimum* shown as a pair, never month-end alone |
| **Target rate** | Solve backwards from a desired life | Build-up waterfall (commitments → living costs → goals → savings → tax); tier presets (break-even / comfortable / secure); output as hourly rate, monthly, and net-equivalent |
| **Assumptions** | Everything the model guessed | Table of assumptions with confidence and last-reviewed date; FX snapshot with date and source; reporting-currency selector; work calendar editor |

**Navigation:** persistent left rail (Today, Timeline, Money in, Money out, Scenarios, Target rate) with Assumptions in a settings position. Scenario selector is global and persists across Timeline / Scenarios / Target rate.

---

## 5. User stories

Format: **As a** [role] **I want** [capability] **so that** [outcome], with acceptance criteria. `[MVP]` ships first; `[P2]` and `[P3]` follow.

### Epic A — Accounts and current position

**A1 `[MVP]`** As a user, I want to add accounts in different currencies with their current balances, so that my starting position is accurate.
- Given I add an account, I can set name, currency, balance, and type
- Balances display in native currency, with the reporting-currency equivalent shown secondary
- The dashboard total sums only accounts flagged `includeInTotal`

**A2 `[MVP]`** As a user, I want to set one reporting currency, so that everything comparable is expressed in a single unit.
- All aggregates, charts and metrics render in the reporting currency
- Source amounts are never rewritten — changing the reporting currency changes only presentation
- Each converted figure can reveal its source amount and the FX rate used

**A3 `[MVP]`** As a user, I want FX rates stored as dated snapshots, so that a projection I ran yesterday gives the same numbers today.
- Rates carry `asOfDate` and `source`
- The UI shows rate age and warns when older than 30 days
- Re-running a projection with an unchanged snapshot produces byte-identical results

**A4 `[P2]`** As a user, I want to update balances quickly, so that reality and the model don't drift apart.
- Single screen to enter current balances for all accounts
- Shows projected vs actual with the variance, and offers to log the difference as an unbudgeted event

---

### Epic B — Income

**B1 `[MVP]`** As an hourly earner, I want to define income as rate × hours/day × working days, so that my income varies with the calendar like it actually does.
- I set hourly rate, hours per day, and a work calendar
- The app derives working days per period and shows the resulting amount per payment and per month
- A month with fewer working days shows lower income without any manual edit

**B2 `[MVP]`** As a user, I want to define *when* I get paid as a rule, so that payment dates are generated rather than typed.
- Supported: specific day of month, month end, every N days, nth weekday, one-off
- Multiple schedules per stream (e.g. the 15th **and** month end)
- The editor previews the next 6 generated dates

**B3 `[MVP]`** As a user, I want payment dates to shift when they land on a non-working day, so that the projection matches my bank.
- Slippage policy per schedule: next business day / previous / none
- Preview shows the shifted date with the original struck through

**B4 `[MVP]`** As a user, I want to mark income as recurring or one-off and set my confidence in it, so that a bonus is never mistaken for a salary.
- Every stream carries `recurrence` and `confidence`
- One-off and uncertain income are visually distinct in every chart and in the legend
- Annualised figures exclude one-offs by default, with a toggle to include them

**B5 `[MVP]`** As a user with a second income I'm unsure about, I want to project with and without it, so that I can see both futures.
- Any stream can be toggled on/off within a scenario
- Uncertain streams get an end date after which they're excluded
- The comparison view shows both outcomes side by side

**B6 `[P2]`** As a user, I want to record a raise or rate change effective from a date, so that projections step at the right moment.
- Rate changes are dated; historical periods retain the old rate

**B7 `[P2]`** As a user, I want to log planned time off, so that unbilled weeks are reflected before they surprise me.
- Time off reduces working days and therefore income
- The app shows the cost of a planned holiday in lost billing

---

### Epic C — Obligations and spending

**C1 `[MVP]`** As a user, I want each obligation to have its own due date, so that the projection reflects when money actually leaves.
- Due date defined by schedule rule, not a monthly average
- The system must not offer "spread evenly across the month" as an option (see D1)

**C2 `[MVP]`** As a user, I want to say whether a payment covers the current, next, or previous period, so that upfront rent and arrears billing are both correct.
- `coversPeriod` on each schedule
- The timeline labels the covered period, e.g. "September rent, paid 28 August"

**C3 `[MVP]`** As a user, I want obligations in their own currency, so that a rouble mortgage and a euro rent stay honest.
- Amount + currency per obligation
- Charts show the reporting-currency value with the source on hover

**C4 `[MVP]`** As a user, I want daily-accrual expenses with a cap, so that groceries are a budget I can check myself against.
- Store daily amount and charge cadence separately
- Timeline can display them as a daily drift or as periodic charges
- Shows the monthly total for 28-, 30- and 31-day months

**C5 `[MVP]`** As a user, I want to add one-off events with a date, so that a birthday or a deposit lands on the right day.
- Name, amount, currency, date, direction, category
- One-offs appear distinctly in every view

**C6 `[P2]`** As a user, I want to see what each obligation costs me in billable hours, so that spending is expressed in the unit I actually earn.
- Each line shows `amount ÷ (hourly rate × reporting FX)` as hours
- The total is compared against available working hours, and flags when it exceeds them

**C7 `[P3]`** As a user, I want to categorise spending and see shares, so that I know which lines are worth attacking.

---

### Epic D — Projection engine

**D1 `[MVP]`** As a user, I want a day-by-day projection over a chosen horizon, so that I can see the shape of my money rather than a monthly summary.
- Daily balance for every day in range
- Every event carries date, label, amount, kind, balance before, balance after

**D2 `[MVP]`** As a user, I want to see the *lowest point in each month*, not just the month-end balance, so that I find the days I'd actually bounce.
- Both series computed and shown as a pair
- Month-end must never be presented alone (see D2 in domain rules)
- The minimum's exact date is labelled

**D3 `[MVP]`** As a user, I want to be warned about any projected negative day, so that timing problems surface before they happen.
- Banner listing every negative date and the shortfall
- Each warning suggests the nearest fix: shift a payment, hold back an amount, bring an inflow forward
- Warning persists until resolved or dismissed with a reason

**D4 `[MVP]`** As a user, I want same-day events ordered explicitly, so that a day's outcome isn't down to chance.
- Default order: income → transfers → obligations → daily expenses
- Order is configurable, and the timeline shows the running balance between same-day events

**D5 `[MVP]`** As a user, I want headline metrics computed automatically, so that I don't recalculate them by hand.
- Monthly surplus/deficit, annual equivalent, runway in months, first negative date
- Each metric can be expanded to show its inputs

**D6 `[P2]`** As a user, I want to see a *sequenced* view of a planned transition, so that I can check the order as well as the amounts.
- A transition (e.g. a move) is a group of dated one-offs
- The app flags when two large outflows fall within N days of each other, ahead of an inflow

---

### Epic E — Interactive what-ifs

**E1 `[MVP]`** As a user, I want to change any number and see the projection update immediately, so that exploring is fast.
- Inline editing of rate, hours, any obligation amount, any daily cap
- Charts and metrics recompute under ~200ms
- A reset returns to the saved baseline

**E2 `[MVP]`** As a user, I want named scenarios, so that I can keep several futures side by side.
- A scenario is a set of dated diffs on the baseline, not a duplicate
- Create, rename, duplicate, delete; one is always the baseline

**E3 `[MVP]`** As a user, I want to compare up to four scenarios, so that a decision is visible rather than argued.
- Table: monthly gap, first negative date, end balance, break-even rate
- Overlaid month-end *and* monthly-minimum charts
- The best outcome per column is highlighted

**E4 `[P2]`** As a user, I want scenario diffs to take effect from a date, so that "I move in December" is modelled as a step, not a rewrite of history.

**E5 `[P2]`** As a user, I want a scenario to carry its own transition costs, so that the cost of getting there is included.
- One-off costs and refunds attached to the scenario, each dated
- Payback period calculated against the ongoing saving

**E6 `[P2]`** As a user, I want sensitivity sliders on the biggest levers, so that I can see how much each one is worth.
- Slider per lever (rate, hours, each major obligation, daily cap)
- Live readout: change per month, per year, and % of the gap closed

**E7 `[P3]`** As a user, I want the app to rank my levers by impact, so that I spend effort where it matters.

---

### Epic F — Target rate

**F1 `[MVP]`** As a user, I want the app to solve for the hourly rate that covers my commitments, so that I know what to ask for.
- Given obligations, tax rules and billable hours, solve for required rate
- Show the derivation, not just the answer

**F2 `[MVP]`** As a user, I want the solve to use *realistic* billable hours, so that the number survives contact with a holiday.
- Hours derived from the work calendar minus holidays and planned time off
- The app warns if the solve uses every weekday of the year

**F3 `[MVP]`** As a user, I want tax modelled as fixed plus marginal, so that a raise isn't overstated.
- Fixed monthly component and marginal rate configurable
- The solve grosses up the increment at the marginal rate
- Displays the rule of thumb: "each extra 1.00 kept costs X billed"

**F4 `[P2]`** As a user, I want target tiers, so that I can see the difference between surviving and living.
- Presets: break-even / comfortable (goals included) / secure (savings included)
- Build-up waterfall showing what each tier adds

**F5 `[P2]`** As a user, I want to add savings goals with a target and horizon, so that they're funded rather than hoped for.
- Goal with target amount and date generates a required monthly contribution

**F6 `[P3]`** As a user, I want the target expressed as an employed net-salary equivalent, so that I can compare offers across contract types.

---

### Epic G — Trust and transparency

**G1 `[MVP]`** As a user, I want every estimated value flagged, so that I know which numbers are real.
- Estimated fields carry a confidence marker in the UI
- One Assumptions screen lists them all with last-reviewed dates

**G2 `[MVP]`** As a user, I want to see the assumptions behind any figure, so that I can challenge it.
- Any metric expands to show inputs, formula and the assumptions used

**G3 `[P2]`** As a user, I want to be nudged to review stale assumptions, so that the model doesn't quietly rot.
- Prompt when an assumption hasn't been reviewed in 90 days, or an FX snapshot in 30

**G4 `[P2]`** As a user, I want to export a projection, so that I can share or archive it.
- CSV of events and daily balances; PDF or PNG of the current view

**G5 `[P3]`** As a user, I want to record what actually happened against what was projected, so that the model improves.

---

## 6. Suggested build order

| Phase | Contents | Delivers |
|---|---|---|
| **1 — Foundation** | A1–A3, B1–B4, C1–C3, C5, D1, D4 | Accurate model of today plus a correct day-by-day projection |
| **2 — Insight** | C4, D2, D3, D5, G1, G2 | Trough detection, warnings, and metrics — the point where it beats a spreadsheet |
| **3 — Interaction** | E1–E3, B5 | Scenarios and live what-ifs |
| **4 — Direction** | F1–F3 | Target-rate solving |
| **5 — Depth** | All `[P2]` | Sensitivity, transitions, tiers, export |

**Definition of done for phase 2:** the app reproduces a hand-built projection exactly, including the intra-month minimum and every negative day, with no manual adjustment.

---

## 7. Non-functional notes

- **Deterministic:** identical inputs must always give identical outputs. No live FX or `now()` inside the projection engine — pass dates in.
- **Local-first:** data stays on the device by default. Sync is a later, optional concern.
- **Fast:** full recompute on any edit, targeting under 200ms for a 12-month daily projection (~365 days × ~80 events).
- **Charts:** always pair month-end with monthly-minimum. Colour by entity, never by rank. Income and outflow read as a diverging pair; recurring and one-off must be distinguishable without relying on colour alone.
- **Precision:** store money in minor units as integers. Round only at display.
- **Accessibility:** every chart has a table view; no meaning carried by colour alone.
