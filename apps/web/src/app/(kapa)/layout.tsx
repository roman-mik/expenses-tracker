import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Meta');
  return {
    title: t('title'),
    description: t('description'),
    appleWebApp: {
      capable: true,
      title: t('appleWebAppTitle'),
      statusBarStyle: 'default',
    },
  };
}

export default function KapaLayout({ children }: LayoutProps<'/'>) {
  return children;
}
