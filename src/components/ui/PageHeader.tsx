import { Button } from '@/components/ui/Button';
import { ChevronLeftIcon } from '@/components/ui/icons';

/**
 * The back-link header shared by every sub-page (add / cap / categories /
 * edit / history / household / settings) and by PageLoadingShell's skeleton.
 * The three-column grid keeps the title visually centered regardless of the
 * Back pill's width.
 */
export function PageHeader({
  title,
  backHref = '/',
}: {
  title: string;
  /** Where the Back pill points — defaults to Home. */
  backHref?: string;
}) {
  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center">
      <Button href={backHref} variant="pill" className="justify-self-start">
        <ChevronLeftIcon />
        Back
      </Button>
      <span className="font-heading text-xl">{title}</span>
      <span aria-hidden />
    </header>
  );
}
