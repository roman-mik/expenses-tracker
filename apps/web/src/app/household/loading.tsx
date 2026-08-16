import { getTranslations } from 'next-intl/server';
import { PageLoadingShell } from '@/components/ui/PageLoadingShell';

export default async function HouseholdLoading() {
  const t = await getTranslations('Household');
  return (
    <PageLoadingShell title={t('title')}>
      <div className="h-16 w-full rounded-lg bg-sand-200" />
      <div className="h-16 w-full rounded-lg bg-sand-200" />
      <div className="h-12 w-full rounded-lg bg-sand-200" />
    </PageLoadingShell>
  );
}
