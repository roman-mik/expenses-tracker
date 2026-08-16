import { getTranslations } from 'next-intl/server';
import { PageLoadingShell } from '@/components/ui/PageLoadingShell';

export default async function EditExpenseLoading() {
  const t = await getTranslations('Add');
  return (
    <PageLoadingShell title={t('titleEdit')} backHref="/history">
      <div className="h-14 w-full rounded-lg bg-sand-200" />
      <div className="flex gap-3">
        <div className="h-10 w-20 rounded-lg bg-sand-200" />
        <div className="h-10 w-20 rounded-lg bg-sand-200" />
        <div className="h-10 w-20 rounded-lg bg-sand-200" />
      </div>
      <div className="h-14 w-full rounded-lg bg-sand-200" />
      <div className="h-12 w-full rounded-lg bg-sand-200" />
    </PageLoadingShell>
  );
}
