import { PageLoadingShell } from '@/components/ui/PageLoadingShell';

export default function CategoriesLoading() {
  return (
    <PageLoadingShell title="Categories">
      <div className="h-3 w-28 rounded bg-sand-200" />
      <div className="h-14 w-full rounded-lg bg-sand-200" />
      <div className="h-14 w-full rounded-lg bg-sand-200" />
      <div className="h-14 w-full rounded-lg bg-sand-200" />
      <div className="h-11 w-full rounded-lg bg-sand-200" />
    </PageLoadingShell>
  );
}
