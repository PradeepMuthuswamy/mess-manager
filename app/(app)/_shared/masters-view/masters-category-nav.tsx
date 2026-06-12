import Link from 'next/link';
import {
  CATEGORY_META,
  type CategorySlug,
} from '@/lib/masters/categories';

// Tab strip over the master category slugs. Same shadcn-token strip + active
// state as the Stock tab strip, but is link/URL driven
// (`?cat=`) so the masters surfaces stay SSR and linkable. Labels are reused
// from CATEGORY_META so they always match the admin masters console.
//
// `basePath` lets the same nav serve multiple surfaces (e.g. '/masters',
// '/bar/masters', '/grocery'); `slugs` restricts which category tabs render on
// that surface. Single-category surfaces (one slug) render no tabs.
export function MastersCategoryNav({
  active,
  basePath,
  slugs,
}: {
  active: CategorySlug;
  basePath: string;
  slugs: readonly CategorySlug[];
}) {
  if (slugs.length < 2) return null;

  return (
    <nav
      aria-label="Master categories"
      className="inline-flex items-center gap-1 rounded-[0.375rem] border border-border bg-muted p-1"
    >
      {slugs.map((slug) => {
        const isActive = slug === active;
        return (
          <Link
            key={slug}
            href={`${basePath}?cat=${slug}`}
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
