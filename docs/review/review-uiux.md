## UI/UX Design

**Overall assessment.** Kapa has a genuinely strong point of view: a warm, non-scolding voice, a coherent sand/terracotta/sage token set in `globals.css`, a single `Button` primitive, a shared `PageHeader`, and real loading shells on every route. The core loop (see remaining → add expense) is short and the "one number" — remaining — is correctly the largest thing on screen. The weaknesses are systematic rather than scattered: (1) the design system is only half-adopted — auth, 404 and error routes bypass `Button`/tokens and hand-roll `bg-[var(--color-accent)]`; (2) accessibility has structural gaps — no `<h1>` on any app page, placeholder-as-label on five forms, sub-44px tap targets throughout the row actions, an invisible focus ring on the primary CTA, and several text/background pairs below 4.5:1; (3) there is no dark mode at all despite a PWA that lives on a phone home screen; (4) the mobile-first product hides its only chart behind `lg:`; and (5) `formatMoney` pins every locale to `sr-RS`, so the RU (and EN) number grouping is wrong. None of these are architectural — they're mostly one-file fixes — but the a11y and contrast set should be treated as release blockers for a consumer app.

---

### Primary CTA has an invisible focus ring and fails text contrast

**Severity: High**

`src/components/ui/Button.tsx:12` sets `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent` on the shared base, and `src/components/ui/Button.tsx:15` gives the primary variant `bg-accent text-white`. An accent-colored ring drawn directly on an accent-colored button is invisible — the base deliberately kills the global `:focus-visible` outline from `src/app/globals.css:121-124` and replaces it with a ring that has no `ring-offset`. Keyboard users lose the focus indicator on the single most important control in the app (`Add expense`, home `src/app/page.tsx:155`).

Separately, `#c67139` (`--color-accent`, `globals.css:40`) against white text is ≈3.6:1 — below the 4.5:1 WCAG AA threshold for the 16px semibold button label. The same pair recurs on the selected category chip (`src/components/add/AddExpenseForm.tsx:127`) and the active history filter chip (`src/components/history/CategoryFilter.tsx:17`).

**Recommendation:** add `focus-visible:ring-offset-2 focus-visible:ring-offset-bg` to `base`, and switch the primary fill (and selected-chip fill) to `--color-accent-600` `#b2622d` (≈4.6:1) or `accent-700` `#8c491a` (≈6.8:1). Keep `--color-accent` for borders, the focus outline and the theme-color meta, where the 3:1 non-text threshold is the relevant one.

---

### No page has an `<h1>`; heading order starts at `<h2>`

**Severity: High**

`src/components/ui/PageHeader.tsx:26` renders the page title as `<span className="font-heading text-xl">`. Every sub-page (add, cap, categories, edit, history, household, settings) therefore has no `<h1>`. Home is worse: `src/components/layout/AppHeader.tsx:62` renders the "Kapa" wordmark as a `<span>`, and the first heading on the page is the `<h2>` at `src/app/page.tsx:161` ("Today"). The only `<h1>`s in the codebase are on `login`, `not-found` and `error` (`src/app/login/page.tsx:22`, `src/app/not-found.tsx:10`, `src/app/error.tsx:30`). Screen-reader users navigating by heading get no page identity, and the document outline is broken on every authenticated route.

**Recommendation:** make `PageHeader`'s title an `<h1>` (visual size is unchanged — the `h1..h6` rule in `globals.css:79-88` already applies `font-heading`). On home, add a visually-hidden `<h1>` for the app/month, or promote the "Left to spend" label at `src/app/page.tsx:78` to the `<h1>` and keep its current styling.

---

### Placeholder-only inputs: five forms have no accessible label

**Severity: High**

- `src/components/add/AddExpenseForm.tsx:138-145` — note field: `placeholder` only, no `<label>`, no `aria-label`.
- `src/components/auth/LoginForm.tsx:42-59` — email and password: `placeholder` only.
- `src/components/categories/CategoryManager.tsx:130-136` — the edit-name input has **neither** label nor placeholder; `src/components/categories/CategoryManager.tsx:292-299` (add-name) has placeholder only.
- `src/components/household/HouseholdPanel.tsx:153-158` — invite-code input: placeholder `ABCD1234` only.

Placeholders vanish on first keystroke and are not reliably exposed as accessible names. `DisplayNameForm` (`src/components/settings/DisplayNameForm.tsx:37-48`) and `LocaleForm` (`src/components/settings/LocaleForm.tsx:39-54`) already do this correctly with a wrapping `<label>` — the pattern exists, it just isn't applied.

**Recommendation:** copy the `DisplayNameForm` wrapping-`<label>` pattern to all five. For the compact ones (note, join code) a visually-hidden label or `aria-label` is enough. While there: add `autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={8}` to the invite-code input, which is force-uppercased in JS (`HouseholdPanel.tsx:155`) but fights the mobile keyboard the whole way.

---

### Numeric entry: keypad cannot express decimals, has no keyboard support, and announces nothing

**Severity: High**

`src/components/add/AddExpenseForm.tsx:17` defines a digits-only keypad and `AddExpenseForm.tsx:49-50` multiplies by `10 ** CURRENCY_EXPONENT[currency]`. For RSD (exponent 0) that's a deliberate, correct design choice. For EUR/USD households (exponent 2) it means **whole euros only** — `4.50` is unenterable, and there is no decimal or `⌫`-to-cents affordance.

Three further gaps in the same component:
- No hardware-keyboard path. There is no `onKeyDown` handler and no `<input inputMode="decimal">` fallback, so on a desktop/tablet-with-keyboard install the amount can only be entered by clicking twelve on-screen buttons. The task brief's `inputMode`/`pattern` question resolves to "there is no input element at all."
- The amount readout (`AddExpenseForm.tsx:90-92`) is a plain `<span>`, not focusable and not a live region. A screen-reader user pressing "5" hears the button name and gets zero confirmation of the running total.
- Backspace is labelled `⌫` with `aria-label={t('deleteDigit')}` = "Delete" / "Стереть" — ambiguous with deleting the whole expense.

**Recommendation:** wrap the readout in `aria-live="polite"` with a formatted `aria-label` (`"1.500 RSD, 3.500 left after this"`). Add a `.`/`,` key (or a hidden `<input inputMode="decimal">` mirroring the state) gated on `CURRENCY_EXPONENT[currency] > 0`. Add a `keydown` listener mapping `0-9`, `Backspace` and `Enter`. Rename the backspace label to "Delete last digit".

---

### Secondary text tone fails 4.5:1 across the whole app

**Severity: High**

The muted-ink scale is used everywhere for real content, not just decoration, and the lighter steps fail AA against `--color-bg #f5ead8`:

| Class | Approx. ratio | Representative use |
|---|---|---|
| `text-ink/45` | ≈2.6:1 | empty states — `src/components/home/TodayList.tsx:20`, `src/components/home/HistoryList.tsx:40`; expense note/attribution — `TodayList.tsx:44-45` |
| `text-ink/50` | ≈2.9:1 | every section label — `src/app/page.tsx:78`, `page.tsx:161`, `src/components/home/DailySpendChart.tsx:32`, `src/components/categories/CategoryManager.tsx:339` |
| `text-ink/55` | ≈3.2:1 | the currency code beside the hero number — `src/app/page.tsx:90` |
| `text-ink/60` | ≈3.5:1 | `src/components/home/PaceLine.tsx:34`, `src/components/home/ProjectionCard.tsx:29`, `src/components/ui/…` help text |

`text-ink/70` (≈5.3:1) and darker are fine. The failing steps are 12px uppercase micro-labels in several cases, which is the worst combination of small size and low contrast.

**Recommendation:** define semantic tokens — `--color-ink-muted` (≈`ink/72`) and `--color-ink-subtle` (≈`ink/62`, reserved for genuinely decorative text) — in `@theme` and replace the `/45`–`/60` opacities. This also removes ~40 ad-hoc opacity variants and gives dark mode a single place to re-map.

---

### No dark mode

**Severity: High**

`src/app/globals.css` defines exactly one palette (`:root`-equivalent `@theme`, lines 18-72). There is no `@media (prefers-color-scheme: dark)` block, no `dark:` variant anywhere in `src/` (grep returns zero hits), and `src/app/layout.tsx:41-43` pins `themeColor: '#c67139'` unconditionally. A cream `#f5ead8` full-screen app is genuinely unpleasant at night, and this is a PWA whose most common session is "log a dinner expense at 10pm."

**Recommendation:** the token architecture already makes this cheap. Keep the light values on `@theme`, then add a `@media (prefers-color-scheme: dark)` block remapping only `--color-bg`, `--color-surface`, `--color-ink`, and inverting the sand ramp; the sage/accent ramps need lightness bumps (`accent-400`/`sage-400` become the "700" roles). Add the matching `themeColor` media array in the `Viewport` export. Verify the category swatch tokens listed in `category-colors.ts` stay distinguishable in both.

---

### The mobile-first app hides its only chart on mobile

**Severity: High**

`src/app/page.tsx:179-186` places `DailySpendChart` inside `<div className="hidden lg:flex …">`. On every phone — the stated primary target — the daily-spend history is simply absent, and there is no route that shows it either (`/history` renders `CategoryBreakdown`, not the daily chart). The component itself is well-built (`role="img"` with a translated summary at `DailySpendChart.tsx:36-38`, plus an `sr-only` data table at `DailySpendChart.tsx:68-74`) — it's just unreachable for most users.

**Recommendation:** render it on mobile, collapsed under the Today list or behind a `<details>`, at a shorter height (`h-24`). At 28-31 bars in a ~330px-wide viewport each bar is ~8px with a 3px gap, which still reads fine as a sparkline.

---

### Sub-pages have no navigation — only "Back to home"

**Severity: Medium**

`AppHeader` (with the four-destination menu) is mounted only on home (`src/app/page.tsx:66`). Every other route renders `PageHeader`, whose sole control is a Back pill to `/` (`src/components/ui/PageHeader.tsx:22-25`). Going Settings → Categories is Back, open menu, Categories — three interactions for a lateral move between two items in the same menu. The Back pill is also a hard link to a fixed href, not history-aware: arriving at `/cap` from the home card's "Adjust cap" and pressing Back lands on `/`, which is right, but arriving at `/history` from `/edit/:id` and pressing Back also goes to `/history` regardless of where the user actually came from (`src/app/edit/[id]/page.tsx:47`).

**Recommendation:** render the `AppHeader` menu button in `PageHeader`'s right-hand grid cell — the third column is currently an empty `<span aria-hidden />` (`PageHeader.tsx:27`), so the layout already reserves the space. That makes all five destinations reachable from anywhere in one tap and costs no vertical space.

---

### Tap targets below 44px on the most-used row actions

**Severity: Medium**

`Button` correctly guarantees `min-h-11` (`src/components/ui/Button.tsx:12`), but most interactive elements bypass it:

- Delete expense — `src/components/home/HistoryList.tsx:165-172`, `px-2 py-1` around a 15px icon ≈ 27×31px.
- Reorder arrows — `src/components/categories/CategoryManager.tsx:195-212`, `px-2 py-1` around a text glyph ≈ 24×26px, and they sit adjacent to each other so mis-taps reorder the wrong way.
- Archive / confirm / cancel — `CategoryManager.tsx:217-232`, same `px-2 py-1`.
- Color swatches — `CategoryManager.tsx:32` `size-6` = 24×24px.
- Category chips — `AddExpenseForm.tsx:125` and `CategoryFilter.tsx:15`, `py-2 text-sm` ≈ 36px tall; these are on the critical path of the primary task.
- Toast dismiss — `src/components/ui/Toast.tsx:76-83`, a bare `×` glyph with no padding, ≈16px.
- Cap nudge checkbox — `src/components/cap/SetCapForm.tsx:107-112`, `size-5` = 20px (mitigated by the wrapping `<label>` at line 103, which makes the whole row hittable — good).

**Recommendation:** add a `min-h-11 min-w-11` icon-button variant to `Button` and route all of the above through it. Where the visual mark must stay small (swatches, the ● color dots), keep the 24px paint and expand the hit area with padding or a `::after` overlay rather than growing the visual.

---

### Loading skeletons don't match their pages — visible layout shift on three routes

**Severity: Medium**

- **History width jump.** `src/app/history/loading.tsx:7` uses `PageLoadingShell`, which hard-codes `max-w-md` (`src/components/ui/PageLoadingShell.tsx:22`), but `src/app/history/page.tsx:105` renders at `max-w-xl`. The content visibly widens when data lands.
- **Home desktop jump.** `src/app/loading.tsx:9` is `max-w-xl` single-column; `src/app/page.tsx:64` is `max-w-xl lg:max-w-5xl lg:grid lg:grid-cols-2`. On desktop the shell is a narrow column that snaps into a two-column grid.
- **Home card height jump.** The skeleton card (`src/app/loading.tsx:15-23`) has 4 children; the real card (`src/app/page.tsx:77-153`) has up to 7 (label, amount, bar, adjust-cap button, days row, PaceLine, ProjectionCard) — roughly 120px of growth, which shoves the `Add expense` button down right as the user reaches for it.
- **Add page.** `src/app/add/loading.tsx:8-15` shows four generic bars; the real page is a 4×3 keypad grid of ~56px keys (`AddExpenseForm.tsx:103-114`). Nothing about the shape matches.

Also: `PageLoadingShell.tsx:25` and `src/app/loading.tsx:9` apply `animate-pulse` unconditionally — no `motion-safe:` guard, and there is no `prefers-reduced-motion` rule anywhere in `globals.css`.

**Recommendation:** make `PageLoadingShell` accept a `maxWidth` prop (or read it from the route) so history matches; mirror the `lg:` grid in the home shell; add a keypad-shaped grid to the add skeleton; wrap the pulse in `motion-safe:animate-pulse` and add a global `@media (prefers-reduced-motion: reduce)` block that also neutralizes the popover transition at `globals.css:103-107` and the `transition-[width]`/`transition-[height]` bar animations (`SpentBar.tsx:31`, `DailySpendChart.tsx:59`).

---

### Money is formatted in `sr-RS` for every locale

**Severity: Medium**

`src/lib/format.ts:22` hard-codes `new Intl.NumberFormat('sr-RS', …)`. Serbian grouping uses `.` — so an English user sees `65.000` for sixty-five thousand (which reads as 65 in en-US), and a Russian user sees `65.000` where RU convention is a narrow space, `65 000`. The doc comment frames this as intentional ("the Serbian-formatted strings the design uses"), but the app shipped EN and RU locales in Phase 7 and the formatter was not revisited. Date labels *did* get this right — `src/app/history/page.tsx:61-64` passes `getLocale()` into `dayLabel`.

**Recommendation:** thread the active locale into `formatMoney` (or expose a `useFormatter()`-based wrapper from next-intl). If the intent is "always show amounts the way a Serbian bank statement does," that decision should at minimum not follow the UI language — but for RU/EN users it will read as a bug.

---

### Popover menu detaches from its trigger on scroll or resize

**Severity: Medium**

`src/components/layout/AppHeader.tsx:44-58` computes `top`/`right` once, in the `beforetoggle` handler, and writes them onto a `position: fixed` panel (`AppHeader.tsx:80`). No `scroll` or `resize` listener re-runs `position()`. Open the menu, scroll the page — the panel stays pinned to the viewport while the trigger moves away; rotate the phone and it lands off-target. On iOS the URL-bar collapse fires a resize mid-interaction, which is exactly the case the code's own comment says it's working around.

The trigger also declares `aria-haspopup="true"` (`AppHeader.tsx:69`) but never sets `aria-expanded`, so assistive tech can't tell whether the menu is open.

**Recommendation:** re-run `position()` on `scroll` (capture) and `resize` while the popover is open, or switch the panel to `position: absolute` inside a `relative` wrapper and accept the top-layer caveat. Add `aria-expanded` toggled from the same `beforetoggle` handler, and change `aria-haspopup` to `"menu"`.

---

### Toasts auto-dismiss errors after 4 seconds and are the only error surface

**Severity: Medium**

`src/components/ui/Toast.tsx:23,44` dismisses every toast after 4000ms regardless of kind. Errors get the same treatment as "Category saved". Since the toast is the *only* error channel for every mutation — `AddExpenseForm.tsx:80`, `SetCapForm.tsx:58`, `CategoryManager.tsx:88,106,121,272`, `HistoryList.tsx:107`, `HouseholdPanel.tsx:38,77` — a user who looks away loses the failure message entirely, with no inline state left on the form to recover from. WCAG 2.2.1 (Timing Adjustable) applies. The dismiss timer is also never cleared on unmount (`Toast.tsx:44`).

Two smaller issues in the same file: the live region is `aria-live="polite"` for errors too (`Toast.tsx:62`) — failures should be `assertive` — and the region is positioned `bottom-0` with `pointer-events-none`, so a toast can sit directly over the fixed-position primary CTA area on short viewports.

**Recommendation:** persist error toasts until dismissed (or 10s+), split the live region into a polite region for successes and an assertive one for errors, `clearTimeout` on unmount, and additionally surface submit errors inline near the failing control in `AddExpenseForm`/`SetCapForm` so the message survives.

---

### Home screen density: four prose paragraphs compete under one number

**Severity: Medium**

The hierarchy of the hero card is right — `remaining` at `text-5xl` (`src/app/page.tsx:83`) is unambiguously the one number. Below it, though, the healthy state stacks: the bar's two labels (`SpentBar.tsx:35-43`), an "Adjust cap →" ghost button, a two-part days/safe-a-day row (`page.tsx:109-129`), a full sentence from `PaceLine` (`PaceLine.tsx:22`, EN: *"Nicely paced — you're X under an even month. Nothing to fix today."*), and `ProjectionCard`'s label + number. In the nudge state, `NudgeBanner` adds a third sentence *above* the card that restates `remaining` and `safeDaily` — both of which are already on screen ten pixels below (`page.tsx:68-75` vs. `page.tsx:118-128`). In the over state, `RecoveryPlan` contributes two more sentences.

The result is that the two genuinely actionable numbers — `safe a day` and `days left` — are set at `text-sm` in a row that visually reads as a footnote, while three sentences of reassuring prose carry the same weight.

**Recommendation:** promote `safe a day` to a secondary stat (a `text-2xl` figure paired with the hero, not a `text-sm` inline `<strong>`), and demote `PaceLine`/`ProjectionCard` into one line — they answer the same question ("am I on track?") twice. When `NudgeBanner` renders, suppress its duplicated `remaining`/`safeDaily` figures and keep only the "getting close" sentence; the numbers are already below it.

---

### Cap slider is the only input, has no accessible value text, and its range is currency-blind

**Severity: Medium**

`src/components/cap/SetCapForm.tsx:77-86` is a bare `<input type="range">` with `min={20_000} max={300_000} step={1_000}` (`SetCapForm.tsx:13-15`). Three problems:

- **No `aria-valuetext`.** Screen readers announce the raw minor-unit integer — "65000" — while the visible label says `65.000 RSD` (`SetCapForm.tsx:70-73`). For a EUR household (`CURRENCY_EXPONENT` 2) the announced number is 100× the displayed one.
- **No numeric alternative.** 280 discrete steps on a ~330px touch track is roughly one pixel per step; hitting an exact cap is a fine-motor task with no way to type the number instead.
- **Currency-blind bounds.** The constants are RSD-shaped. In a EUR household the cap is silently clamped to €200–€3,000, and `SetCapForm.tsx:37-38` `Math.min(Math.max(initialCap || MIN, MIN), MAX)` will *silently rewrite* an out-of-range stored cap when the form mounts — the user opens the page and the displayed cap differs from their actual cap, with no notice.

**Recommendation:** add `aria-valuetext={formatMoney(cap, currency) + ' ' + currency}`, pair the slider with a numeric input (`inputMode="numeric"`), and derive MIN/MAX/STEP from `CURRENCY_EXPONENT[currency]`. At minimum, surface a note when the mount-time clamp changes the value.

---

### Auth, 404 and error routes bypass the design system

**Severity: Medium**

Four files hand-roll what `Button` and the Tailwind theme utilities already provide, using arbitrary-value `[var(--color-…)]` syntax instead of the generated `bg-accent` / `text-ink` / `rounded-md` utilities:

- `src/app/login/page.tsx:22-25` — `font-[family-name:var(--font-heading)] text-[var(--color-accent)]`.
- `src/components/auth/LoginForm.tsx:49,58,63,68` — three bespoke control styles; the submit button is a raw `<button>` with `disabled:opacity-60` (the system uses `opacity-40`), and the inputs replace the focus ring with a border color change (`focus-visible:border-[var(--color-accent)]`), which is a much weaker indicator than the global 2px outline and is nearly invisible against `--color-surface`.
- `src/app/not-found.tsx:10,16-21` and `src/app/error.tsx:30,40,46` — same pattern; the error page's two actions are a raw `<button>` and a raw `<Link>`, both `py-3` (~46px, incidentally fine) but with no focus styling of their own.
- `src/app/global-error.tsx:24-71` — fully inline-styled with hard-coded hexes and `system-ui`, and hard-coded English strings (`global-error.tsx:40-44`) that a RU user will hit untranslated.

The login screen is the first thing a new user sees and it's the least on-brand surface in the app.

**Recommendation:** replace all of these with `Button` + theme utilities. `global-error.tsx` genuinely can't use the app's CSS (it replaces the root layout), so inline styles are justified there — but it should at least read the same hexes from a shared constant and accept that it's English-only by explicit choice, not by omission.

Also worth noting: `LoginForm.tsx:31` renders `error.message` straight from Supabase — an untranslated, developer-voiced English string ("Invalid login credentials") dropped into the app's warm, localized copy, in a `<p>` with no `role="alert"` so it isn't announced.

---

### Offline banner promises more than the app can deliver, and shifts the whole page

**Severity: Medium**

`src/components/pwa/OfflineBanner.tsx:20-27` renders in normal flow at the top of `<body>` (`src/app/layout.tsx:55`), above `{children}`. When connectivity drops it pushes the entire page down by ~36px — a full-viewport layout shift mid-interaction.

More importantly, the copy is a promise: *"You're offline. Anything you add will go through the moment you're back."* (`messages/en.json:191`). The only offline machinery is `experimental.useOffline` in `next.config.ts`, and `public/` contains icons only — no service worker, no precached shell. `useOffline` retries *in-flight* navigations and Server Actions; it does not make the app load from a cold start while offline, and it does not queue an expense across a page reload or app relaunch. For an installed PWA, the realistic offline story today is "the tab you already have open will retry" — which is not what the sentence says.

**Recommendation:** pin the banner (`sticky top-0`) so it overlays rather than displaces, and either (a) soften the copy to "You're offline — we'll retry when you're back" or (b) implement the promise with a service worker + an outbox that survives reload. Given the manifest markets Kapa as a home-screen app (`src/app/manifest.ts:11-13`), (b) is the honest fix.

---

### iOS safe-area insets are declared but inert

**Severity: Medium**

`src/components/ui/Toast.tsx:64` is the only place in the app that references `env(safe-area-inset-*)`. But `src/app/layout.tsx:41-43` exports a `Viewport` with only `themeColor` — there's no `viewportFit: 'cover'`, and without it iOS resolves every `safe-area-inset-*` to `0`. So the toast padding is a no-op, and conversely nothing else is protected: every page uses a plain `px-6 py-12` main (`src/app/page.tsx:63`, `add/page.tsx:32`, and five siblings), so in a landscape-notched or home-indicator context the content can sit under the indicator.

**Recommendation:** add `viewportFit: 'cover'` to the `Viewport` export, then add `pb-[env(safe-area-inset-bottom)]` / `px-[max(1.5rem,env(safe-area-inset-left))]` to the shared main wrapper. Since seven pages repeat the identical `<main className="flex-1 flex justify-center px-6 py-12">`, extract it as a `PageShell` component and fix it in one place.

---

### The primary action isn't thumb-reachable

**Severity: Medium**

`Add expense` sits inline in the document flow at `src/app/page.tsx:155-157`, below the ~380px hero card plus (conditionally) the nudge banner. On a 667pt iPhone SE viewport with the nudge banner showing, it is at or below the fold; on any device it is in the middle third of the screen, the least comfortable zone for a one-handed thumb. The manifest's own pitch is "every expense in two taps" (`src/app/manifest.ts:11`) — today it's scroll, tap, tap-per-digit, tap.

**Recommendation:** make it a fixed bottom-anchored bar or FAB on mobile (`fixed bottom-0 inset-x-0 lg:static`), with `pb-[env(safe-area-inset-bottom)]` and matching bottom padding on `<main>` so the last expense row isn't occluded. This also puts it out of the toast region's way, which currently overlaps the same area.

---

### `SpentBar` state is conveyed by fill color alone, at 1.9:1 against its track

**Severity: Medium**

`src/components/home/SpentBar.tsx:7-11` maps three states to three fills (`bg-sage` / `bg-accent` / `bg-accent-700`) inside a `bg-sand-300` track (`SpentBar.tsx:29`). Two problems:

- **Non-text contrast.** `--color-sage #8fa073` against `--color-sand-300 #dcd3c4` is ≈1.9:1, below the 3:1 minimum for a meaningful graphical object. In the healthy state — the most common one — the fill boundary is hard to locate, which is the entire information content of the bar.
- **The bar itself has no accessible representation.** It's two `<div>`s with no `role="progressbar"`, no `aria-valuenow`/`valuemax`, and no state text. A screen reader gets only the two text labels below it (`SpentBar.tsx:35-43`, "X spent / of Y") — the percentage and the healthy/nudge/over state are visual-only. The state *is* echoed by the "Left to spend" vs. "Over budget by" label at `src/app/page.tsx:79`, which mitigates this, but the bar's own reading is lost.

**Recommendation:** darken the healthy fill to `sage-600 #728157` (≈3.2:1 against the track) or lighten the track to `sand-200`. Add `role="progressbar" aria-valuenow={spentPct} aria-valuemin={0} aria-valuemax={100} aria-label={…}` to the outer div, with the state folded into the label ("62% of cap used, on track").

---

### RU translation defects and length risk

**Severity: Medium**

Pluralization is done correctly — `messages/ru.json:39` and `ru.json:58` both use the full `one/few/many/other` CLDR set, which is more than most codebases manage. Three issues remain:

- **Truncated string.** `messages/ru.json:137` translates "Sharing this cap" as `"Общий лимит с"` — "Shared limit **with**", a dangling preposition. It renders as a standalone `<h2>` (`src/components/household/HouseholdPanel.tsx:88`) with nothing following it. Should be `"Общий лимит"`.
- **Nested quotation marks.** `ru.json:187` produces `«На экран «Домой»»` — nested identical guillemets. RU typography nests as `«…„…“…»`.
- **Length overflow risk in flex rows.** `SetCapForm`'s `Consequence` rows are `flex items-center justify-between` with no wrapping allowance (`src/components/cap/SetCapForm.tsx:124-127`); `"Уже потрачено в этом месяце"` (`ru.json:108`, 27 chars vs. EN's 25) plus a formatted amount plus a currency code is tight at 320px. Same shape in `ProjectionCard` (`ProjectionCard.tsx:28`), where `"При таком темпе к концу месяца выйдет около"` is 43 characters against EN's 34, sharing one line with a number. And the nav pills: `"Присоединиться"` (`ru.json:153`) inside a `Button` next to a flex-1 input (`HouseholdPanel.tsx:152-167`) will squeeze the input hard.
- **Locale switching UX.** `LocaleForm` (`src/components/settings/LocaleForm.tsx:38-59`) requires selecting *and then* pressing "Save language" — a two-step for a setting whose effect is instantly visible. The `<select>` is also unstyled beyond a background, so it renders as a platform control amid an otherwise custom system.

**Recommendation:** fix the two string defects; add `min-w-0` + `truncate`/`text-balance` or switch to a stacked layout below `sm` for the label/value rows; make the locale `<select>` apply on change (with the toast as confirmation) and drop the save button.

---

### Category chips are toggle buttons without toggle semantics

**Severity: Low**

`src/components/add/AddExpenseForm.tsx:121-133` renders each category as a `<button>` whose selected state is communicated only by `bg-accent text-white`. There's no `aria-pressed`, no `role="radio"` in a `radiogroup`, and no group label — so a screen-reader user hears a list of plain buttons with no indication of which (if any) is chosen, and no way to know that tapping the selected one deselects it. `CategoryFilter` (`src/components/history/CategoryFilter.tsx:25,36`) gets this right with `aria-current="page"` on links; `CategoryManager`'s swatches get it right with `aria-pressed` (`CategoryManager.tsx:31`). The add form is the outlier — and it's the one on the critical path.

**Recommendation:** add `aria-pressed={selected}` and wrap the group in a labelled `role="group"` (or `<fieldset><legend class="sr-only">`).

---

### Empty states are honest but inert

**Severity: Low**

The copy is genuinely good — `"Nothing logged today. A quiet day is a good day."` (`messages/en.json:66`, rendered at `src/components/home/TodayList.tsx:20`) is exactly the right voice. But all three empty states are a single line of `text-ink/45` with no affordance:

- `TodayList.tsx:20` — no "Add your first expense" action (the button is elsewhere on the page, so this is defensible).
- `HistoryList.tsx:40` — *"Add an expense to see it here"* names an action but doesn't link to `/add`.
- `CategoryManager.tsx:343` — `"No categories yet."`, and this one matters: a household with no categories gets an add form with an empty chip row (`AddExpenseForm.tsx:117-135` renders an empty flex container) and no explanation.

**Recommendation:** link the `HistoryList` empty state to `/add`. In `AddExpenseForm`, render a "Set up categories" link when `categories.length === 0` instead of an invisible empty row.

---

### `formatMoney` output can be visually ambiguous at the hero size

**Severity: Nit**

`src/app/page.tsx:85-92` renders the hero amount and the currency code as separate spans with `items-baseline gap-2`, the amount in `font-heading` (Caprasimo) at `text-5xl` and the code in the body font. Caprasimo has no Cyrillic coverage — the comment at `src/app/layout.tsx:13-17` correctly notes the fallback to `system-ui` per glyph. Digits are Latin so the hero number is unaffected, but any RU page title routed through an `h1`-with-`font-heading` (see the heading finding above) will render in a *different* typeface from its EN counterpart — the display font silently disappears for Russian users on headings. Worth a deliberate decision rather than a fallback.

**Recommendation:** either accept it explicitly (document that RU headings use the system stack) or pick a display face with Cyrillic coverage so the brand holds in both locales.

---

### Hard-coded `title` tooltip on chart bars

**Severity: Nit**

`src/components/home/DailySpendChart.tsx:58` uses `title={`${d.dateKey}: …`}` — a raw ISO `YYYY-MM-DD` key, not a locale-formatted date, and `title` tooltips never appear on touch devices. The `sr-only` list at `DailySpendChart.tsx:68-74` repeats the same unformatted key.

**Recommendation:** format the date with the active locale (the `dayLabel` helper in `src/lib/date.ts` already does this for history), and consider a tap-to-reveal readout instead of `title` once the chart is shown on mobile.

---

## What's done well

- **The token layer is real.** `globals.css:18-72` defines fonts, three color ramps, radii and elevation as `@theme` tokens, and the app consumes them as generated utilities (`bg-surface`, `text-ink`, `rounded-lg`, `shadow-md`) rather than raw hexes. The `@source inline(...)` escape hatch at `globals.css:11` for runtime-interpolated swatch colors is a correct, well-documented solution to a real Tailwind v4 scanning problem.
- **`Button` is a genuine primitive** — one base, four variants, polymorphic Link/button, `min-h-11` guaranteed, consistent disabled treatment (`src/components/ui/Button.tsx:11-19`). Adoption is high in the app shell; the gaps are at the edges (auth/error routes, icon buttons).
- **Every route has a `loading.tsx`,** and `PageLoadingShell` renders the *real* header so Back is usable the instant navigation starts (`src/components/ui/PageLoadingShell.tsx:23`) — a thoughtful detail most apps skip.
- **The chart has a proper text alternative:** `role="img"` with a translated summary plus an `sr-only` list of every data point (`DailySpendChart.tsx:36-38, 68-74`). This is better chart accessibility than most production dashboards.
- **RU pluralization is CLDR-correct,** including the `=0` exact-match case (`messages/ru.json:39,58`) — genuinely rare to get right.
- **Native Popover API for the nav menu** (`AppHeader.tsx:78`) buys light-dismiss, Escape and top-layer rendering with no JS state and no focus-trap bugs.
- **Voice and copy are consistently excellent and never blaming** — `RecoveryPlan` suppresses its suggested cap when the math would read as punitive (`src/components/home/RecoveryPlan.tsx:18,34`), and `ProjectionCard` refuses to render a wild early-month projection (`ProjectionCard.tsx:10,23`). These are product-design decisions encoded in the components, not afterthoughts.
- **Destructive actions use inline two-step confirmation** rather than a modal (`HistoryList.tsx:136-154`, `CategoryManager.tsx:215-233`) — fast, reversible, no dialog a11y burden.
- **Per-action busy state, not per-component.** `CategoryManager.tsx:75-76` tracks *which* action is pending so only the pressed control shows "Saving…" — a detail that matters on a list of rows.
- **Server-rendered category filter** (`src/components/history/CategoryFilter.tsx:5`) works without client JS and gets `aria-current="page"` for free.
- **`tabular-nums` on every money figure** (`TodayList.tsx:48`, `HistoryList.tsx:132`, `CategoryBreakdown.tsx:60-63`, `SetCapForm.tsx:126`) — numbers don't jitter as they update.
- **Edit-mode math is correct UX:** `src/app/edit/[id]/page.tsx:41` adds the expense's own amount back before computing "left after this", so editing reads as a replacement rather than a double-charge.
