/**
 * Allowed category swatch colors — theme token names from the sand/accent/sage
 * ramps in `globals.css`. `Category.color` is interpolated into
 * `var(--color-${color})` when rendering, so constraining it to a known list
 * keeps the swatch picker a simple enum and avoids ever writing an
 * unrecognized token to CSS.
 */
export const CATEGORY_COLORS = [
  'sand-500',
  'sand-700',
  'accent-400',
  'accent-500',
  'accent-700',
  'sage-400',
  'sage-500',
  'sage-700',
] as const;
