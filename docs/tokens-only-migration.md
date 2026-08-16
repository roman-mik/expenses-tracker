# Tokens-only migration: removing Tamagui from Kapa

**Status:** executed 2026-08-17, on branch `tokens-only-migration`.
**Context:** the Tamagui integration was entirely uncommitted (see `git status` at the time —
every Tamagui-touched tracked file was `M`, every Tamagui-specific file was `??`). This
migration was a revert of working-tree state, not a rewrite of shipped history.

Deviations from this spec found during execution:
- The type scale (§7 step 3) was ported, not dropped, per user decision — see §6a's
  `fontSize`/`lineHeight`/`letterSpacing` groups, emitted under non-colliding
  `--text-*`/`--leading-*`/`--tracking-*` custom properties rather than as overrides of
  Tailwind's default `text-sm`/`text-lg` scale, so the compiled-CSS parity gate stays clean.
- The compiled-CSS diff (§7 step 6) was not perfectly byte-identical: `--color-white`
  changed from Tailwind's built-in default (`#fff`, since the original `globals.css` never
  defined that token itself) to the package's explicit `#ffffff`. Same color, different
  literal — reviewed and accepted, not a regression.
- `pnpm-workspace.yaml`'s `allowBuilds.esbuild` had to stay `true` — it's pulled in by
  `vite`/`vitest` independent of Tamagui, not only by `@tamagui/cli` as this spec assumed.
- The §6b `ghost` → `ink-muted` a11y sweep landed as part of this same effort rather than a
  fully separate change, once the pixel-parity gate passed clean.

---

## 1. Why

Tamagui was adopted to get one shared component layer across `apps/web` and a future
`apps/mobile` (PLAN.md §5 — Expo, **postponed**). What it actually produced:

- **One shared component**, `ButtonFrame` — and it is already forked. `apps/web`'s
  `Button.tsx` renders `ButtonFrame` for `<button>` and a `next/link` + `Button.module.css`
  for `<a>`, because Tamagui's `tag` is fixed per component and can't switch at runtime.
  Two implementations of one button, kept in sync by hand.
- **`react-native-web` in the web bundle**, plus a `resolveAlias` in `next.config.ts`, plus
  four `transpilePackages` entries, plus a `.web.tsx` resolver chain in `vitest.config.mts`,
  plus a `__DEV__` define, plus a `matchMedia` shim in `src/test/setup.ts` — all for a
  platform with no app.
- **A `'use client'` boundary at the root** (`NextTamaguiProvider` wraps everything in
  `layout.tsx`), in an App Router app whose whole architecture is Server Components +
  Server Actions.
- **A pre-`next build` codegen step** (`tamagui build`) emitting a committed
  `public/tamagui.generated.css`.
- **A test regression**: `AddExpenseForm.test.tsx` had to drop `toBeDisabled()` for an
  `aria-disabled` string assertion, because Tamagui's Button isn't a native disabled button.

The cost is real and paid today; the benefit is one forked component and a hypothetical
mobile app. This migration deletes the cost and keeps the part that was actually worth
sharing: **the token values**.

## 2. Goal / non-goals

**Goal.** `@kapa/ui` becomes a zero-dependency, platform-agnostic TypeScript token package.
`apps/web` returns to plain Tailwind 4 + `@theme`, with no `react-native-web` anywhere.
A future `apps/mobile` imports the same token module and feeds it to whatever native
styling engine it picks (Unistyles 3, or plain `StyleSheet`).

**Non-goals.**

- Sharing *components* across platforms. Explicitly abandoned — see §8.
- Changing any visual output. This migration must be pixel-identical to `HEAD`.
- Touching `lib/kapa-math.ts`, `lib/queries/*`, `lib/mutations/*`. Those are the real
  cross-platform layer and they already work (PLAN.md §4).
- Dark mode. Still an open gap (`docs/review/review-uiux.md`); the token package should
  make it *easier* later, not implement it now.

## 3. End state

```
packages/ui/
  package.json          deps: {} — no react, no tamagui, no react-native-web
  src/index.ts          re-exports tokens only
  src/tokens.ts         THE source of truth: color, radius, shadow, semantic, font
  scripts/build-theme.ts  emits theme.css from tokens.ts
  theme.css             GENERATED, committed, CI-gated

apps/web/
  src/app/globals.css   @import '@kapa/ui/theme.css' — its own @theme block is gone;
                        the non-token rules (@source inline, body, h1..h6, [popover],
                        :focus-visible, ::selection) stay untouched
  src/components/ui/Button.tsx   HEAD's version: one component, <button> or <a>,
                                 no 'use client', no CSS module
  next.config.ts        transpilePackages: ['@kapa/ui'] only; no resolveAlias
```

`apps/web` consumes the tokens two ways, both of them real imports: `globals.css` does
`@import '@kapa/ui/theme.css'` (generated from `tokens.ts`) for everything Tailwind-driven,
and the four sites needing a color *in JavaScript* import `color` directly. See §5.

## 4. File inventory

### 4a. Delete (all untracked — `git clean` territory, no history impact)

| Path | Note |
|---|---|
| `packages/ui/src/config.ts` | `createTamagui()` wrapper |
| `packages/ui/src/themes.ts` | Tamagui theme shape; semantic aliases move into `tokens.ts` (§5) |
| `packages/ui/src/fonts.ts` | `createFont()` scales — see §7 step 3 before deleting |
| `packages/ui/src/components/Button.tsx` | and the now-empty `src/components/` dir |
| `apps/web/tamagui.config.ts` | |
| `apps/web/tamagui.build.ts` | |
| `apps/web/src/app/NextTamaguiProvider.tsx` | |
| `apps/web/public/tamagui.generated.css` | |
| `apps/web/src/components/ui/Button.module.css` | the forked `<a>` styling |

### 4b. Revert to `HEAD` (`git checkout HEAD -- <path>`)

| Path | What comes back |
|---|---|
| `apps/web/src/components/ui/Button.tsx` | one component, both cases, Tailwind classes, no `'use client'` |
| `apps/web/src/app/layout.tsx` | drops `NextTamaguiProvider` + the generated-CSS import |
| `apps/web/src/test/intl.tsx` | drops `TamaguiProvider` wrapper |
| `apps/web/src/test/setup.ts` | drops the `matchMedia` shim — verified unused elsewhere; `InstallPrompt.tsx` calls `matchMedia` only inside a `useSyncExternalStore` client subscription, which jsdom tests don't reach |
| `apps/web/src/components/add/AddExpenseForm.test.tsx` | `toBeDisabled()` / `toBeEnabled()` restored |
| `apps/web/vitest.config.mts` | drops the `react-native` alias, `.web.tsx` extensions, `__DEV__` |
| `apps/web/eslint.config.mjs` | drops the `.tamagui/**` ignore |
| `.gitignore` | drops the `.tamagui/` entry |
| `pnpm-workspace.yaml` | drops `esbuild: true` from `allowBuilds` — grepped, no other dependent |

### 4c. Hand-edit (partial revert — do **not** blind-checkout)

**`apps/web/package.json`**
- `scripts.build`: `"tamagui build --target web ./src -- next build"` → `"next build"`
- remove deps: `@tamagui/config`, `@tamagui/core`, `@tamagui/web`, `tamagui`, `react-native-web`
- remove devDep: `@tamagui/cli`
- **keep** `@kapa/ui: workspace:*`

**`packages/ui/package.json`**
- dependencies → `{}` (drop `@tamagui/config`, `@tamagui/core`, `tamagui`,
  `react-native-web`, and `react` — the package exports no components now)
- keep `typescript` + drop `@types/react` from devDependencies

**`apps/web/next.config.ts`**
- `transpilePackages: ['@kapa/ui']` — drop `react-native-web`, `@tamagui/core`, `tamagui`
- delete the entire `turbopack.resolveAlias` block **and its explanatory comment**
- leave `experimental.useOffline`, the CSP block, and `headers()` untouched

**`packages/ui/src/index.ts`** — rewrite (§5).
**`packages/ui/src/tokens.ts`** — rewrite (§5).

## 5. The token package

`packages/ui/src/tokens.ts` — plain data, no imports:

```ts
// Single source of truth for Kapa's design values, shared by apps/web
// (mirrored into the Tailwind @theme block in src/app/globals.css, guarded
// by tokens.test.ts) and any future apps/mobile (consumed directly).
//
// Web CSS custom properties are kebab-case (`--color-sand-500`); these keys
// are camelCase (`sand500`). tokens.test.ts owns that mapping.

export const color = { /* verbatim from the current tokens.ts — values unchanged */ } as const;

export const radius = { sm: 8, md: 16, lg: 28 } as const;

// Web wants a box-shadow string; React Native wants shadowColor/Offset/
// Radius/Opacity. Both shapes, one set of numbers.
export const shadow = {
  sm: {
    css: '0 1px 2px color-mix(in srgb, #2e2b25 14%, transparent)',
    native: { shadowColor: color.sand900, shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, shadowOpacity: 0.14 },
  },
  // md, lg likewise
} as const;

// Semantic aliases — the layer that survives from themes.ts. These are the
// names components reason about; `color` is the raw palette.
export const semantic = {
  accentBackground: color.accent600,  // not `accent`: #c67139 on white is ~3.6:1,
                                      // accent600 clears AA at ~4.6:1
  accentBackgroundHover: color.accent700,
  accentColor: color.white,
  border: color.sand400,
  placeholder: color.inkSubtle,
} as const;

export const font = {
  body: 'var(--font-body), system-ui, sans-serif',
  heading: 'var(--font-heading), Georgia, serif',
} as const;
```

`packages/ui/src/index.ts`:

```ts
export { color, radius, shadow, semantic, font } from './tokens';
```

### Web consumers

Most of `apps/web` reaches these values through Tailwind utility classes, which resolve
against the `@theme` block in `globals.css` — that path involves no import. But four sites
need a color as a JavaScript value, because they render outside the stylesheet entirely,
and today each hardcodes a hex:

| Site | Currently | Should be | Why it can't use CSS |
|---|---|---|---|
| `src/app/layout.tsx` `viewport.themeColor` | `'#c67139'` | `color.accent` | serialized to a `<meta>` tag |
| `src/app/manifest.ts` `background_color` | `'#f5ead8'` | `color.bg` | serialized to `manifest.webmanifest` |
| `src/app/manifest.ts` `theme_color` | `'#c67139'` | `color.accent` | ditto |
| `src/app/global-error.tsx` inline styles | `'#c67139'`, `'#201e1d'` | `color.accent`, `color.ink` | replaces the whole tree incl. root layout, so `globals.css` may not be loaded |

Wiring these up is what makes `@kapa/ui` a live dependency rather than a package nothing
imports, and it removes four hardcoded hexes that no drift test currently covers. Do it in
step 6.

Note this does **not** extend to `src/lib/category-colors.ts`. Those are deliberately token
*names* (`'sand-500'`), interpolated into `var(--color-${color})` and pinned by the
`@source inline(...)` directive in `globals.css` — they're already indirect through the CSS
layer, and the drift test covers whether the names resolve.

### The `@theme` block is generated from `tokens.ts`

There is exactly one source of truth: `packages/ui/src/tokens.ts`. The Tailwind `@theme`
block is a build artifact of it.

`packages/ui/scripts/build-theme.ts` walks `color`, `radius`, and `shadow` and writes
`packages/ui/theme.css`:

```css
/* GENERATED by packages/ui/scripts/build-theme.ts — do not edit.
   Source of truth: packages/ui/src/tokens.ts */
@theme {
  --color-bg: #f5ead8;
  --color-ink-muted: #645c50;
  --color-sand-500: #a19786;
  --radius-lg: 28px;
  --shadow-md: 0 3px 10px color-mix(in srgb, #2e2b25 16%, transparent);
}
```

camelCase → kebab-case via "insert `-` before each digit-run or uppercase letter, then
lowercase" (`sand500 → sand-500`, `inkMuted → ink-muted`). Doc comments on the token
groups are emitted as CSS comments, so the a11y rationale currently living in the
`@theme` block survives.

`apps/web/src/app/globals.css` then loses its `@theme` block entirely and opens:

```css
@import 'tailwindcss';
@import '@kapa/ui/theme.css';
```

Everything else in `globals.css` — `@source inline(...)`, the `body`/`h1..h6` rules, the
`[popover]` layer, `:focus-visible`, `::selection` — stays exactly as it is. Those are
*rules*, not tokens, and they're web-only.

**This requires an `exports` entry in `packages/ui/package.json`** — Tailwind resolves CSS
imports through the `"style"` condition, and without it the build fails with
`"./theme.css" is not exported under the condition "style"`:

```jsonc
"exports": {
  ".": "./src/index.ts",
  "./theme.css": { "style": "./theme.css", "default": "./theme.css" }
}
```

**Verified against tailwindcss 4.3.3** (this repo's pinned version) by compiling a probe
through `@tailwindcss/postcss`: `@theme` in an `@import`ed file is honored, and
`bg-*`/`text-*`/`rounded-*`/`shadow-*` utilities generate from a workspace package's CSS
exactly as they do inline. No `layer(theme)` wrapper needed.

**Generated file is committed**, with `pnpm --filter @kapa/ui build:theme && git diff
--exit-code packages/ui/theme.css` as a CI gate. Committing it (rather than generating in
a `prebuild`) keeps `next dev` startup free of a codegen dependency and keeps the diff
visible in review — a token change should show up as a CSS change in the PR.

## 6. Two decisions

### 6a. Which direction does generation run? — **decided: TS → CSS**

Given one source of truth, TS has to be the source, not `globals.css`:

- **TS is the richer format.** `shadow.native` (`shadowOffset: { width: 0, height: 3 }`)
  has no CSS representation. Generating CSS from TS is lossless; the reverse isn't.
- **Mobile consumes it with zero build step.** Metro just imports the module. If CSS were
  the source, `apps/mobile` would need a CSS parser to get its colors.
- **The dependency arrow points the right way.** `packages/ui` shouldn't be a derived
  artifact of `apps/web`; the design system would then live inside one of its consumers.

An earlier draft of this spec recommended a drift *test* over generation, on the grounds
that Tailwind 4 only honors `@theme` in its entry file. **That is not true of 4.3.3** — it
was tested and works (see §5). The objection is withdrawn, and with it the reason to keep
two copies of every hex.

The remaining honest cost of generation is one script and one CI gate. That buys the thing
a drift test can't: it becomes *impossible* to change a color in one place and not the
other, because there is only one place.

### 6b. The `ghost` variant's text color — **recommend: defer, out of scope**

HEAD's `ghost` uses `text-ink/70`; the Tamagui port changed it to solid `inkMuted`,
with a good argument in `tokens.ts` (opacity blends shift with the ground behind them, so
their contrast ratio isn't fixed). But `text-ink/70` appears in 8 other places
(`page.tsx`, `AppHeader.tsx`, `icons.tsx`, `AddExpenseForm.tsx`, `CategoryFilter.tsx`,
`InstallPrompt.tsx`). Changing it in `Button` alone makes the app *less* consistent.

Revert faithfully to `text-ink/70`, and file the `ink/70 → ink-muted` sweep as a separate
a11y change touching all 9 sites at once.

## 7. Execution order

Each step ends at a gate. Don't proceed past a red gate.

1. **Branch.** Cut fresh off updated `origin/main`.
2. **Snapshot the baseline.** On `HEAD` (stash the Tamagui work), run the app and capture
   the pages that render Buttons — home, add, history, settings. This is the pixel
   reference for step 8. Unstash.
3. **Harvest before deleting.** `packages/ui/src/fonts.ts` holds a full type scale
   (10 body sizes + line-heights, 7 heading sizes + letter-spacings) that does **not**
   exist anywhere else in the repo — `globals.css` only sets `line-height: 1.12` and
   `letter-spacing: -0.015em` on `h1..h6`. Decide: port the scale into `tokens.ts` as a
   `fontSize`/`lineHeight` group, or accept losing it. Losing it is fine (the app uses
   Tailwind's default scale today) — but decide deliberately, don't let it vanish in a
   `rm`.
4. **Revert §4b** in one commit. Nothing should build yet.
5. **Delete §4a**, apply §4c edits, `pnpm install`. `pnpm-lock.yaml` should shed
   tamagui/react-native-web entirely.
6. **Rewrite `packages/ui`** per §5: `tokens.ts`, `scripts/build-theme.ts`, the `exports`
   entry, and the generated `theme.css`. Then swap `globals.css`'s `@theme` block for the
   `@import`, and point the four JS-value sites at `color`.
   - Gate: `pnpm typecheck && pnpm lint && pnpm test` all green.
   - Gate: **diff the compiled CSS.** Build once before the swap and once after; the emitted
     `:root` custom properties and every `bg-*`/`text-*`/`shadow-*` rule must be byte-identical.
     This is the real proof the generator is faithful — not the token file reading correctly.
   - Gate: regenerating is a no-op — `pnpm --filter @kapa/ui build:theme && git diff --exit-code`.
   - Gate: the built `manifest.webmanifest` and `<meta name="theme-color">` still carry
     `#c67139` / `#f5ead8`. This is a refactor, not a value change.
7. **Verify the bundle is clean.**
   - Gate: `grep -r "react-native" apps/web/.next/static` returns nothing.
   - Gate: `grep -rn "tamagui" apps/web packages --exclude-dir=node_modules` returns nothing
     outside this doc.
8. **Verify visuals.** Re-render the step-2 pages and diff. Any delta is a bug in the
   revert, not an improvement.
9. **Verify the RSC win.** `Button.tsx` should have no `'use client'`, and the root
   `layout.tsx` should have no client provider above `NextIntlClientProvider`.
10. **Update the docs.** `PLAN.md` §5 and its Phase-5 checklist reference Tamagui as the
    shared-UI direction; `packages/ui`'s old placeholder comment said the decision was
    pending. Record the decision: *tokens shared, components not.*

## 8. What `apps/mobile` does later

When Phase 5 unpostpones:

```
apps/mobile/  (Expo)
  imports { color, radius, shadow, semantic } from '@kapa/ui'
  feeds them to Unistyles 3's createStyleSheet (or plain StyleSheet)
  writes its own Button — a Pressable, ~30 lines, using the same tokens
```

The button gets written twice. That is the trade: two ~40-line components that each use
their platform's real primitives (`<a>` with `next/link` prefetch on web; `Pressable` with
native press feedback on mobile), instead of one component that is neither and needs an
escape hatch on both. Given the app has *one* shared component today, "write it twice" is
cheaper than everything in §1.

The reuse that matters — `lib/kapa-math.ts`, and `lib/queries/*` / `lib/mutations/*`
already taking a generic `SupabaseClient<Database>` (PLAN.md §4) — is unaffected by any of
this.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Revert silently loses a fix made during the Tamagui work | §4b is per-file and reviewed; the only intentional non-visual change found was the `ghost` color (§6b) and the type scale (§7 step 3) |
| `pnpm-lock.yaml` churn hides a stray dep | Gate at step 7: grep the built bundle, not the lockfile |
| `@kapa/ui` rots because the web app's styling goes through Tailwind, not through it | It doesn't rot — it's on the critical path. Delete `theme.css` and the web build fails. Every color the app renders traces to `tokens.ts` (§5) |
| Someone hand-edits the generated `theme.css` | Header comment says don't; CI gate at step 6 fails on any diff after regeneration |
| CSP `style-src 'self' 'unsafe-inline'` was sized for Tamagui's runtime style injection | Reverting *reduces* inline styles; no CSP change needed, but re-check the report-only violations after deploy |
