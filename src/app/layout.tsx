import type { Metadata, Viewport } from 'next';
import { Caprasimo, Figtree } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';
import './globals.css';

const figtree = Figtree({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

const caprasimo = Caprasimo({
  variable: '--font-heading',
  subsets: ['latin'],
  weight: '400',
});

export const metadata: Metadata = {
  title: 'Kapa — one cap, every expense in two taps',
  description: "A warm monthly spending-cap tracker. Always know what's left.",
  appleWebApp: {
    capable: true,
    title: 'Kapa',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#c67139',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${figtree.variable} ${caprasimo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-body">
        <OfflineBanner />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
