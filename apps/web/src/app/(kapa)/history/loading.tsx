import { getTranslations } from 'next-intl/server';
import { PageLoadingShell } from '@/components/ui/PageLoadingShell';

export default async function HistoryLoading() {
  const t = await getTranslations('History');
  return (
    <PageLoadingShell title={t('title')}>
      <div className="h-24 w-full rounded-lg bg-sand-200" />
      <div className="flex gap-3">
        <div className="h-8 w-16 rounded-lg bg-sand-200" />
        <div className="h-8 w-16 rounded-lg bg-sand-200" />
        <div className="h-8 w-16 rounded-lg bg-sand-200" />
      </div>
      <div className="h-16 w-full rounded-lg bg-sand-200" />
      <div className="h-16 w-full rounded-lg bg-sand-200" />
      <div className="h-16 w-full rounded-lg bg-sand-200" />
    </PageLoadingShell>
  );
}
