import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import { ChevronLeftIcon } from '@/components/ui/icons';

/**
 * The back-link header shared by every sub-page (add / cap / categories /
 * edit / history / household / settings) and by PageLoadingShell's skeleton.
 * The three-column grid keeps the title visually centered regardless of the
 * Back pill's width.
 */
export async function PageHeader({
  title,
  backHref = '/pocket',
}: {
  title: string;
  /** Where the Back pill points — defaults to Pocket home. */
  backHref?: string;
}) {
  const t = await getTranslations('Common');
  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center">
      <Button href={backHref} variant="pill" className="justify-self-start">
        <ChevronLeftIcon />
        {t('back')}
      </Button>
      <h1 className="font-heading text-xl">{title}</h1>
      <span aria-hidden />
    </header>
  );
}
