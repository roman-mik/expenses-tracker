import type { Viewport } from 'next';
import { Caprasimo, Figtree } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { color } from '@kapa/ui';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';
import { ToastProvider } from '@/components/ui/Toast';
import './globals.css';

// Server components keep full access to every namespace via getTranslations;
// this only scopes what's serialized into the client bundle/HTML. The list is
// every namespace a 'use client' component reaches via useTranslations(<ns>)
// — grep for that call across src/components and src/app before adding a
// new client component that needs a namespace not already here.
const CLIENT_MESSAGE_NAMESPACES = [
  'Common',
  'Settings',
  'HistoryList',
  'Login',
  'Nav',
  'PWA',
  'Cap',
  'Categories',
  'Add',
  'Household',
  'ErrorPage',
  'Horizon',
] as const;

function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: readonly K[]
): Pick<T, K> {
  return Object.fromEntries(
    keys.filter((k) => k in obj).map((k) => [k, obj[k]])
  ) as Pick<T, K>;
}

const figtree = Figtree({
  variable: '--font-body',
  // Neither Figtree nor Caprasimo ship a Cyrillic subset on Google Fonts.
  // Russian text still renders fine: each font's @font-face only declares a
  // latin unicode-range, so browsers automatically fall through to the
  // `system-ui, sans-serif` tail of the --font-body/--font-heading stacks
  // (globals.css) per glyph — no extra config needed.
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

const caprasimo = Caprasimo({
  variable: '--font-heading',
  subsets: ['latin'],
  weight: '400',
});

export const viewport: Viewport = {
  themeColor: color.accent,
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${figtree.variable} ${caprasimo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-body">
        <NextIntlClientProvider
          messages={pick(messages, CLIENT_MESSAGE_NAMESPACES)}
        >
          <OfflineBanner />
          <ToastProvider>{children}</ToastProvider>
        </NextIntlClientProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
