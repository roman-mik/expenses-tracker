import { PageLoadingShell } from '@/components/ui/PageLoadingShell';

export default function SetCapLoading() {
  return (
    <PageLoadingShell title="Set cap">
      <div className="h-3 w-28 rounded bg-sand-200" />
      <div className="h-14 w-full rounded-lg bg-sand-200" />
      <div className="h-20 w-full rounded-lg bg-sand-200" />
      <div className="h-12 w-full rounded-lg bg-sand-200" />
    </PageLoadingShell>
  );
}
