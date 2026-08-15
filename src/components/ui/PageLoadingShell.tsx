import type { ReactNode } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';

/**
 * Shared instant-navigation shell for the sub-pages (add / cap / household).
 * Renders the real back-header (so the title and Back link are usable the
 * instant navigation starts) above a pulsing skeleton of the page body, which
 * Next swaps out once the server component's data resolves.
 */
export function PageLoadingShell({
  title,
  backHref = '/',
  children,
}: {
  title: string;
  /** Where the Back pill points while loading — match the loaded page's own back link. */
  backHref?: string;
  children: ReactNode;
}) {
  return (
    <main className="flex-1 flex justify-center px-6 py-12">
      <div className="w-full max-w-md flex flex-col gap-8">
        <PageHeader title={title} backHref={backHref} />

        <div className="flex flex-col gap-5 animate-pulse">{children}</div>
      </div>
    </main>
  );
}
