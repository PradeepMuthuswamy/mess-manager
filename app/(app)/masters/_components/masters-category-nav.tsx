import Link from 'next/link';
import {
  CATEGORY_META,
  CATEGORY_SLUGS,
  type CategorySlug,
} from '@/lib/masters/categories';

// Tab strip over the master category slugs. Mirrors InventoryCategoryNav
// exactly (same shadcn-token strip + active state) but is link/URL driven
// (`?cat=`) so the single /masters route stays SSR and linkable. Labels are
// reused from CATEGORY_META so they always match the admin masters console.
export function MastersCategoryNav({ active }: { active: CategorySlug }) {
  return (
    <nav
      aria-label="Master categories"
      className="inline-flex items-center gap-1 rounded-[0.375rem] border border-border bg-muted p-1"
    >
      {CATEGORY_SLUGS.map((slug) => {
        const isActive = slug === active;
        return (
          <Link
            key={slug}
            href={`/masters?cat=${slug}`}
            scroll={false}
            className={[
              'transition-ds rounded-[0.25rem] px-3 py-1.5 text-sm font-medium leading-none',
              isActive
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
            aria-current={isActive ? 'page' : undefined}
          >
            {CATEGORY_META[slug].title}
          </Link>
        );
      })}
    </nav>
  );
}

