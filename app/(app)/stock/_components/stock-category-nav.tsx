import Link from 'next/link';
import {
  STOCK_PAGE_CATEGORIES,
  CATEGORY_META,
  slugFromCategory,
  type InventoryCategory,
} from '@/lib/masters/categories';

// Tab strip over the four stockable inventory categories. Mirrors the Masters
// category nav visually (same shadcn-token strip + active state) but is
// link/URL driven (`?cat=`) so the single /stock route stays SSR and
// linkable — no per-category routes, no client state. Labels are reused from
// CATEGORY_META so they always match Masters.
export function InventoryCategoryNav({
  active,
}: {
  active: InventoryCategory;
}) {
  return (
    <nav
      aria-label="Inventory categories"
      className="inline-flex items-center gap-1 rounded-[0.375rem] border border-border bg-muted p-1"
    >
      {STOCK_PAGE_CATEGORIES.map((cat) => {
        const isActive = cat === active;
        return (
          <Link
            key={cat}
            href={`/stock?cat=${slugFromCategory(cat)}`}
            scroll={false}
            className={[
              'transition-ds rounded-[0.25rem] px-3 py-1.5 text-sm font-medium leading-none',
              isActive
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
            aria-current={isActive ? 'page' : undefined}
          >
            {CATEGORY_META[slugFromCategory(cat)]?.title ?? cat}
          </Link>
        );
      })}
    </nav>
  );
}
