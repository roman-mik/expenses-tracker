import { PageLoadingShell } from '@/components/ui/PageLoadingShell';

export default function EditExpenseLoading() {
  return (
    <PageLoadingShell title="Edit expense">
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
