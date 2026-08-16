/**
 * Server Action tests run outside a real Next.js request, so `next/headers`
 * (which `next-intl/server`'s `getRequestConfig` depends on) isn't available.
 * This is a plain-interpolation stand-in over the real `en.json` — action
 * error copy is all plain strings (no ICU plural/rich text), so it's enough
 * to keep action tests asserting on the real English strings without a full
 * Next request context.
 */
import { vi } from 'vitest';
import en from '../../messages/en.json';

function lookup(namespace: string, key: string): unknown {
  return `${namespace}.${key}`
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      en
    );
}

function interpolate(template: string, values?: Record<string, unknown>) {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    name in values ? String(values[name]) : `{${name}}`
  );
}

function makeT(namespace: string) {
  const t = (key: string, values?: Record<string, unknown>) => {
    const raw = lookup(namespace, key);
    return typeof raw === 'string' ? interpolate(raw, values) : key;
  };
  t.rich = t;
  return t;
}

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => makeT(namespace),
  getLocale: async () => 'en',
}));
