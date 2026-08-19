import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import { HorizonRail } from '@/components/horizon/HorizonRail';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Horizon.meta');
  return { title: t('title') };
}

/**
 * Horizon's shell: a desktop-only left rail. This layout does NOT check
 * auth — per `lib/auth/dal.ts`'s header comment, layouts don't re-render on
 * client-side navigation between sibling routes, so authorization stays on
 * each page (matching every Pocket page). This only decides what to render
 * once a page has already resolved that.
 *
 * The gate is CSS-only (`hidden lg:` / `lg:hidden`), no viewport JS: both
 * branches render server-side and Tailwind picks the visible one, same
 * precedent as the Pocket home's `hidden lg:flex` chart column.
 */
export default async function HorizonLayout({
  children,
}: LayoutProps<'/horizon'>) {
  const t = await getTranslations('Horizon.gate');

  return (
    <>
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center lg:hidden">
        <h1 className="font-heading text-xl">{t('title')}</h1>
        <p className="max-w-xs text-ink-muted">{t('body')}</p>
        <Button href="/pocket" variant="secondary">
          {t('backToPocket')}
        </Button>
      </div>

      <div className="hidden lg:grid lg:min-h-dvh lg:grid-cols-[16rem_1fr]">
        <HorizonRail />
        <main className="p-8">{children}</main>
      </div>
    </>
  );
}
