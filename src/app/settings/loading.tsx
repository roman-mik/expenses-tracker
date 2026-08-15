import { PageLoadingShell } from '@/components/ui/PageLoadingShell';

export default function SettingsLoading() {
  return (
    <PageLoadingShell title="Settings">
      <div className="h-14 w-full rounded-lg bg-sand-200" />
      <div className="h-12 w-full rounded-lg bg-sand-200" />
      <div className="h-12 w-full rounded-lg bg-sand-200" />
    </PageLoadingShell>
  );
}
