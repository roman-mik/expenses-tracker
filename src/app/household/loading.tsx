import { PageLoadingShell } from '@/components/ui/PageLoadingShell';

export default function HouseholdLoading() {
  return (
    <PageLoadingShell title="Household">
      <div className="h-16 w-full rounded-lg bg-sand-200" />
      <div className="h-16 w-full rounded-lg bg-sand-200" />
      <div className="h-12 w-full rounded-lg bg-sand-200" />
    </PageLoadingShell>
  );
}
