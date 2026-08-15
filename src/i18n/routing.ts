/**
 * Locale is not part of the URL (PLAN.md §7 Phase 7) — routes stay
 * `/history`, `/settings`, etc. This is the single source of truth for which
 * locales exist, shared by the request config, the settings Server Action,
 * and the auth callback route.
 */
export const locales = ['en', 'ru'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' && (locales as readonly string[]).includes(value)
  );
}
