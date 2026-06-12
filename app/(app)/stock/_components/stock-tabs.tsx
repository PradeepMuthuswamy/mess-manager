'use client';

import { useCallback, useState } from 'react';
import { StockTable } from '@/app/(app)/_shared/stock-table/stock-table';
import {
  STOCK_PAGE_CATEGORIES,
  CATEGORY_META,
  slugFromCategory,
  type InventoryCategory,
} from '@/lib/masters/categories';
import type { InventoryLotRow, MasterItemPick } from '@/lib/stock/types';
import { cn } from '@/lib/utils';

export type StockCategoryData = {
  rows: InventoryLotRow[];
  masterItems: MasterItemPick[];
};

const EMPTY: StockCategoryData = { rows: [], masterItems: [] };

function tabLabel(category: InventoryCategory): string {
  return CATEGORY_META[slugFromCategory(category)]?.title ?? category;
}

/**
 * Client-side category switcher for the Stock page.
 *
 * The previous strip was `<Link href="/stock?cat=…">`, so every tab click was a
 * full server round-trip on a `force-dynamic` route (re-auth + two DB queries)
 * with no pending UI — the screen sat on the old tab until the new RSC landed,
 * which read as "stuck". It also kept a single persisted `StockTable` instance
 * across those soft navigations, so per-tab UI state (search, row selection,
 * open dialogs) leaked between categories.
 *
 * Now the server preloads every stockable category once and hands the data
 * here; switching tabs is pure local state — instant, no fetch, no navigation.
 * The URL `?cat=` is kept in sync via the History API purely for deep-linking
 * and refresh (no router navigation, so no round-trip). A `key` on StockTable
 * remounts it per category, so each tab starts with clean state.
 */
export function StockTabs({
  initialCategory,
  categoryData,
  canWrite,
  canManageMasters,
}: {
  initialCategory: InventoryCategory;
  categoryData: Partial<Record<InventoryCategory, StockCategoryData>>;
  canWrite: boolean;
  canManageMasters: boolean;
}) {
  const [active, setActive] = useState<InventoryCategory>(initialCategory);

  const selectTab = useCallback((category: InventoryCategory) => {
    setActive(category);
    // Keep the URL shareable/refresh-safe without a Next navigation (which would
    // refetch the dynamic page). History API is the App Router-sanctioned way to
    // update search params shallowly.
    window.history.replaceState(
      null,
      '',
      `/stock?cat=${slugFromCategory(category)}`,
    );
  }, []);

  const data = categoryData[active] ?? EMPTY;

  return (
    <div className="space-y-6">
      <nav
        aria-label="Inventory categories"
        className="inline-flex items-center gap-1 rounded-[0.375rem] border border-border bg-muted p-1"
      >
        {STOCK_PAGE_CATEGORIES.map((category) => {
          const isActive = category === active;
          return (
            <button
              key={category}
              type="button"
              onClick={() => selectTab(category)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'transition-ds rounded-[0.25rem] px-3 py-1.5 text-sm font-medium leading-none',
                isActive
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tabLabel(category)}
            </button>
          );
        })}
      </nav>

      <StockTable
        key={active}
        category={active}
        categoryLabel={tabLabel(active)}
        rows={data.rows}
        masterItems={data.masterItems}
        canWrite={canWrite}
        canManageMasters={canManageMasters}
      />
    </div>
  );
}
