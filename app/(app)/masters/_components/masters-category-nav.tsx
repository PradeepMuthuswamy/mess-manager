import Link from 'next/link';
import {
  CATEGORY_META,
  slugFromCategory,
  type Category,
} from '@/lib/masters/categories';

// The five operational master categories surfaced at /masters. `room` is
// guest-room-only and intentionally excluded (it has no admin master UI).
const MASTERS_CATEGORIES = [
  'ration',
  'soft_drink',
  'alcohol',
  'cigar',
  'grocery',
] as const satisfies readonly Category[];

// Tab strip over the five master categories. Mirrors InventoryCategoryNav
// exactly (same shadcn-token strip + active state) but is link/URL driven
// (`?cat=`) so the single /masters route stays SSR and linkable. Labels are
// reused from CATEGORY_META so they always match the admin masters console.
export function MastersCategoryNav({ active }: { active: Category }) {
  return (
    <nav
      aria-label="Master categories"
      className="inline-flex items-center gap-1 rounded-[0.375rem] border border-border bg-muted p-1"
    >
      {MASTERS_CATEGORIES.map((cat) => {
        const isActive = cat === active;
        const slug = slugFromCategory(cat);
        return (
          <Link
            key={cat}
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
            {CATEGORY_META[cat].title}
          </Link>
        );
      })}
    </nav>
  );
}
