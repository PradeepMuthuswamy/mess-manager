'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { StockTable } from '@/app/(app)/_shared/stock-table/stock-table';
import {
  CATEGORY_META,
  type CategorySlug,
} from '@/lib/masters/categories';
import type { InventoryLotRow, MasterItemPick } from '@/lib/stock/types';
import { cn } from '@/lib/utils';

export type StockCategoryData = {
  rows: InventoryLotRow[];
  masterItems: MasterItemPick[];
  totalCount: number;
};

const EMPTY: StockCategoryData = { rows: [], masterItems: [], totalCount: 0 };

const TABS: readonly CategorySlug[] = [
  'alcohol',
  'cold-drinks',
  'cigars',
  'snacks',
];

function tabLabel(slug: CategorySlug): string {
  return CATEGORY_META[slug]?.title ?? slug;
}

/**
 * Backend-integrated category switcher for the Stock page.
 */
export function StockTabs({
  initialCategory,
  categoryData,
  canWrite,
  canManageMasters,
  currentPage,
  pageSize,
  q,
  sortBy,
  sortOrder,
}: {
  initialCategory: CategorySlug;
  categoryData: Record<CategorySlug, StockCategoryData>;
  canWrite: boolean;
  canManageMasters: boolean;
  currentPage: number;
  pageSize: number;
  q: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}) {
  const router = useRouter();
  const selectTab = useCallback((slug: CategorySlug) => {
    // Navigate via router to refetch the page on the server with clean parameters
    router.push(`/stock?cat=${slug}`);
  }, [router]);

  const currentCategoryData = categoryData[initialCategory] ?? EMPTY;

  return (
    <div className="space-y-6">
      <nav
        aria-label="Inventory categories"
        className="inline-flex items-center gap-1 rounded-[0.375rem] border border-border bg-muted p-1"
      >
        {TABS.map((slug) => {
          const isActive = slug === initialCategory;
          return (
            <button
              key={slug}
              type="button"
              onClick={() => selectTab(slug)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'transition-ds rounded-[0.25rem] px-3 py-1.5 text-sm font-medium leading-none cursor-pointer',
                isActive
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tabLabel(slug)}
            </button>
          );
        })}
      </nav>

      <StockTable
        category={initialCategory}
        categoryLabel={tabLabel(initialCategory)}
        rows={currentCategoryData.rows}
        masterItems={currentCategoryData.masterItems}
        canWrite={canWrite}
        canManageMasters={canManageMasters}
        currentPage={currentPage}
        pageSize={pageSize}
        totalCount={currentCategoryData.totalCount}
        q={q}
        sortBy={sortBy}
        sortOrder={sortOrder}
      />
    </div>
  );
}
