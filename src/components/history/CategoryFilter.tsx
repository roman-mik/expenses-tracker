import Link from 'next/link';
import type { Category } from '@/lib/types';

/** Server-rendered `?category=` chip picker — works without client JS. */
export function CategoryFilter({
  categories,
  activeCategoryId,
}: {
  categories: Category[];
  activeCategoryId: string | null;
}) {
  const chipClass = (active: boolean) =>
    `rounded-full px-4 py-2 text-sm font-medium transition-colors ${
      active
        ? 'bg-accent text-white'
        : 'bg-surface text-ink/70 hover:bg-sand-300'
    }`;

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/history"
        aria-current={activeCategoryId === null ? 'page' : undefined}
        className={chipClass(activeCategoryId === null)}
      >
        All
      </Link>
      {categories
        .filter((c) => !c.archived)
        .map((c) => (
          <Link
            key={c.id}
            href={`/history?category=${c.id}`}
            aria-current={c.id === activeCategoryId ? 'page' : undefined}
            className={chipClass(c.id === activeCategoryId)}
          >
            {c.name}
          </Link>
        ))}
    </div>
  );
}
