import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/**
 * The one button primitive. Renders a Next `<Link>` when `href` is given, else a
 * native `<button>`. Every variant guarantees a ≥44px tap target and a visible
 * focus ring, so navigation and actions stay thumb-friendly and consistent.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'pill' | 'ghost';

const base =
  'inline-flex items-center justify-center gap-2 min-h-11 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:cursor-not-allowed';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white px-5 shadow-md hover:bg-accent-600',
  secondary: 'border border-sand-400 text-ink px-5 hover:bg-surface',
  pill: 'bg-surface text-ink border border-sand-300 px-4 text-sm shadow-sm hover:bg-sand-200',
  ghost: 'text-ink/70 px-3 font-medium hover:text-ink hover:bg-surface',
};

function classesFor(variant: ButtonVariant, className?: string) {
  return `${base} ${variants[variant]}${className ? ` ${className}` : ''}`;
}

type LinkButtonProps = {
  href: string;
  variant?: ButtonVariant;
  children: ReactNode;
} & Omit<ComponentProps<typeof Link>, 'href' | 'className'> & {
    className?: string;
  };

type NativeButtonProps = {
  href?: undefined;
  variant?: ButtonVariant;
  children: ReactNode;
} & Omit<ComponentProps<'button'>, 'className'> & { className?: string };

export function Button(props: LinkButtonProps | NativeButtonProps) {
  const { variant = 'primary', className, children, ...rest } = props;

  if (rest.href !== undefined) {
    const { href, ...linkRest } = rest as LinkButtonProps;
    return (
      <Link
        href={href}
        className={classesFor(variant, className)}
        {...linkRest}
      >
        {children}
      </Link>
    );
  }

  const buttonRest = rest as ComponentProps<'button'>;
  return (
    <button
      {...buttonRest}
      type={buttonRest.type ?? 'button'}
      className={classesFor(variant, className)}
    >
      {children}
    </button>
  );
}
