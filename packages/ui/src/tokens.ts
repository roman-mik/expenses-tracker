// Single source of truth for Kapa's design values, shared by apps/web
// (compiled into a Tailwind @theme block — see scripts/build-theme.ts —
// and @import'ed by apps/web/src/app/globals.css) and any future
// apps/mobile (consumed directly, no build step).
//
// Plain data, no imports. scripts/build-theme.ts runs this file with
// `node --experimental-strip-types`, which only strips types — it doesn't
// resolve a module graph, so this file (and anything it imports) must stay
// dependency-free.
//
// Web CSS custom properties are kebab-case (`--color-sand-500`); these keys
// are camelCase (`sand500`). scripts/build-theme.ts owns that mapping.

export const color = {
  bg: '#f5ead8',
  surface: '#ebddc5',
  ink: '#201e1d',

  // Secondary-text tones. Solid hexes, not opacity blends — opacity shifts
  // toward whichever ground sits behind it, so its contrast ratio isn't
  // fixed. These are chosen to clear 4.5:1 (inkMuted) or stay
  // decorative-only (inkSubtle) against BOTH bg and surface.
  inkMuted: '#645c50', // ~5.5:1 on bg, ~4.9:1 on surface — same value as sand700
  inkSubtle: '#82796a', // ~3.6:1 on bg, ~3.2:1 on surface — decorative only, same as sand600

  // Neutral / sand ramp
  sand100: '#f9f4ed',
  sand200: '#eee7db',
  sand300: '#dcd3c4',
  sand400: '#c0b6a5',
  sand500: '#a19786',
  sand600: '#82796a',
  sand700: '#645c50',
  sand800: '#474238',
  sand900: '#2e2b25',

  // Terracotta accent ramp (default = the design's #c67139)
  accent: '#c67139',
  accent100: '#fff2eb',
  accent200: '#ffe1d0',
  accent300: '#ffc6a5',
  accent400: '#f6a06b',
  accent500: '#d67f48',
  accent600: '#b2622d',
  accent700: '#8c491a',
  accent800: '#643312',
  accent900: '#402310',

  // Sage "you're fine" ramp (default = #8fa073)
  sage: '#8fa073',
  sage100: '#f0fae1',
  sage200: '#e1eecc',
  sage300: '#ccdbb2',
  sage400: '#aebf92',
  sage500: '#8fa073',
  sage600: '#728157',
  sage700: '#56633f',
  sage800: '#3d472b',
  sage900: '#272e1b',

  white: '#ffffff',
} as const;

export const radius = {
  sm: 8,
  md: 16,
  lg: 28,
  xl: 40,
} as const;

// Web wants a box-shadow string; React Native wants shadowColor/Offset/
// Radius/Opacity. Both shapes, one set of numbers. `css` values match
// globals.css's pre-migration @theme block exactly (color-mix, not rgba) —
// that string is what the compiled-CSS parity gate checks byte-for-byte.
export const shadow = {
  sm: {
    css: '0 1px 2px color-mix(in srgb, #2e2b25 14%, transparent)',
    native: {
      shadowColor: color.sand900,
      shadowOffset: { width: 0, height: 1 },
      shadowRadius: 2,
      shadowOpacity: 0.14,
    },
  },
  md: {
    css: '0 3px 10px color-mix(in srgb, #2e2b25 16%, transparent)',
    native: {
      shadowColor: color.sand900,
      shadowOffset: { width: 0, height: 3 },
      shadowRadius: 10,
      shadowOpacity: 0.16,
    },
  },
  lg: {
    css: '0 12px 32px color-mix(in srgb, #2e2b25 22%, transparent)',
    native: {
      shadowColor: color.sand900,
      shadowOffset: { width: 0, height: 12 },
      shadowRadius: 32,
      shadowOpacity: 0.22,
    },
  },
} as const;

// Semantic aliases — the names components reason about; `color` above is
// the raw palette.
export const semantic = {
  accentBackground: color.accent600, // not `accent`: #c67139 on white is ~3.6:1,
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

// Type scale. Loading stays on next/font (apps/web/src/app/layout.tsx) —
// it self-hosts Figtree/Caprasimo at build time and exposes them as the
// --font-body / --font-heading CSS variables `font` above references. These
// sizes are index-keyed (1-10 for body, 1-7 for heading) rather than
// name-keyed (sm/base/lg) deliberately: they're emitted under their own
// --text-body-N / --text-heading-N custom properties (see build-theme.ts),
// not as overrides of Tailwind's default text-sm/text-lg scale, so adopting
// them doesn't resize anything already using Tailwind's defaults.
export const fontSize = {
  body: {
    1: 12,
    2: 13,
    3: 14,
    4: 15,
    5: 16,
    6: 18,
    7: 20,
    8: 23,
    9: 27,
    10: 32,
  },
  heading: {
    1: 18,
    2: 20,
    3: 23,
    4: 27,
    5: 32,
    6: 38,
    7: 46,
  },
} as const;

export const lineHeight = {
  body: {
    1: 16,
    2: 18,
    3: 20,
    4: 21,
    5: 23,
    6: 25,
    7: 27,
    8: 29,
    9: 33,
    10: 38,
  },
  heading: {
    1: 20,
    2: 22,
    3: 26,
    4: 30,
    5: 36,
    6: 43,
    7: 52,
  },
} as const;

// h1..h6 in globals.css set letter-spacing: -0.015em on top of the heading
// font — this is that same ratio applied at each heading size.
export const letterSpacing = {
  heading: {
    1: -0.27,
    2: -0.3,
    3: -0.345,
    4: -0.405,
    5: -0.48,
    6: -0.57,
    7: -0.69,
  },
} as const;
