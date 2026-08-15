'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Category } from '@/lib/types';
import { CATEGORY_COLORS } from '@/lib/category-colors';
import {
  addCategory,
  editCategory,
  moveCategory,
} from '@/app/actions/categories';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { TrashIcon } from '@/components/ui/icons';

function Swatch({
  color,
  selected,
  onClick,
}: {
  color: string;
  selected: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={color}
      aria-pressed={selected}
      className={`size-6 shrink-0 rounded-full transition-shadow ${
        selected ? 'ring-2 ring-offset-2 ring-accent ring-offset-bg' : ''
      }`}
      style={{ backgroundColor: `var(--color-${color})` }}
    />
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORY_COLORS.map((c) => (
        <Swatch
          key={c}
          color={c}
          selected={c === value}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

function CategoryRow({
  category,
  isFirst,
  isLast,
}: {
  category: Category;
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useTranslations('Categories');
  const tCommon = useTranslations('Common');
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<
    null | 'move-up' | 'move-down' | 'save' | 'archive' | 'restore'
  >(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);

  const move = (direction: 'up' | 'down') => {
    setBusy(direction === 'up' ? 'move-up' : 'move-down');
    startTransition(async () => {
      const result = await moveCategory(category.id, direction);
      if (result.ok) router.refresh();
      else toast.error(result.error);
      setBusy(null);
    });
  };

  const save = () => {
    if (!name.trim()) return;
    setBusy('save');
    startTransition(async () => {
      const result = await editCategory(category.id, {
        name: name.trim(),
        color,
      });
      if (result.ok) {
        setEditing(false);
        toast.success(t('categorySaved'));
        router.refresh();
      } else {
        toast.error(result.error);
      }
      setBusy(null);
    });
  };

  const setArchived = (archived: boolean) => {
    setBusy(archived ? 'archive' : 'restore');
    startTransition(async () => {
      const result = await editCategory(category.id, { archived });
      if (result.ok) {
        setConfirming(false);
        toast.success(archived ? t('categoryArchived') : t('categoryRestored'));
        router.refresh();
      } else {
        toast.error(result.error);
      }
      setBusy(null);
    });
  };

  if (editing) {
    return (
      <li className="flex flex-col gap-3 py-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          className="rounded-lg bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40"
          autoFocus
        />
        <ColorPicker value={color} onChange={setColor} />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={save}
            disabled={pending || !name.trim()}
            className="px-4 py-2 text-sm"
          >
            {busy === 'save' ? tCommon('saving') : tCommon('save')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setName(category.name);
              setColor(category.color);
              setEditing(false);
            }}
            disabled={pending}
            className="text-sm"
          >
            {tCommon('cancel')}
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: `var(--color-${category.color})` }}
        />
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={category.archived}
          className="min-w-0 flex-1 truncate text-left text-ink/80 disabled:text-ink/45"
        >
          {category.name}
        </button>

        {category.archived ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setArchived(false)}
            disabled={pending}
            className="text-sm"
          >
            {busy === 'restore' ? t('restoring') : t('restore')}
          </Button>
        ) : (
          <>
            <span className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => move('up')}
                disabled={pending || isFirst}
                aria-label={t('moveUp')}
                className="rounded-md px-2 py-1 text-ink/55 hover:bg-surface hover:text-ink disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move('down')}
                disabled={pending || isLast}
                aria-label={t('moveDown')}
                className="rounded-md px-2 py-1 text-ink/55 hover:bg-surface hover:text-ink disabled:opacity-30"
              >
                ▼
              </button>
            </span>

            {confirming ? (
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setArchived(true)}
                  disabled={pending}
                  className="rounded-md px-2 py-1 text-sm font-medium text-accent-700 hover:bg-surface disabled:opacity-50"
                >
                  {busy === 'archive' ? t('archiving') : t('archiveConfirm')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={pending}
                  className="rounded-md px-2 py-1 text-sm text-ink/55 hover:bg-surface disabled:opacity-50"
                >
                  {tCommon('cancel')}
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                aria-label={t('archiveAria')}
                className="shrink-0 rounded-md px-2 py-1 text-ink/55 transition-colors hover:bg-surface hover:text-accent-700"
              >
                <TrashIcon />
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function AddCategoryForm() {
  const t = useTranslations('Categories');
  const tCommon = useTranslations('Common');
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0]);

  const submit = () => {
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await addCategory({ name: name.trim(), color });
      if (result.ok) {
        setName('');
        setColor(CATEGORY_COLORS[0]);
        setOpen(false);
        toast.success(t('categoryAdded'));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        className="w-full py-3"
      >
        {t('addCategory')}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface p-4">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('namePlaceholder')}
        maxLength={60}
        className="rounded-lg bg-bg px-3 py-2 outline-none focus:ring-2 focus:ring-accent/40"
        autoFocus
      />
      <ColorPicker value={color} onChange={setColor} />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={submit}
          disabled={pending || !name.trim()}
          className="px-4 py-2 text-sm"
        >
          {pending ? t('adding') : t('add')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setName('');
          }}
          disabled={pending}
          className="text-sm"
        >
          {tCommon('cancel')}
        </Button>
      </div>
    </div>
  );
}

export function CategoryManager({ categories }: { categories: Category[] }) {
  const t = useTranslations('Categories');
  const active = categories
    .filter((c) => !c.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const archived = categories
    .filter((c) => c.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wider uppercase text-ink/50">
          {t('sectionTitle')}
        </h2>
        {active.length === 0 ? (
          <p className="text-sm text-ink/45">{t('noCategoriesYet')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-sand-300/60">
            {active.map((c, i) => (
              <CategoryRow
                key={c.id}
                category={c}
                isFirst={i === 0}
                isLast={i === active.length - 1}
              />
            ))}
          </ul>
        )}
        <AddCategoryForm />
      </section>

      {archived.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-wider uppercase text-ink/50">
            {t('archivedTitle')}
          </h2>
          <p className="text-sm text-ink/60">{t('archivedNote')}</p>
          <ul className="flex flex-col divide-y divide-sand-300/60">
            {archived.map((c) => (
              <CategoryRow key={c.id} category={c} isFirst isLast />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
