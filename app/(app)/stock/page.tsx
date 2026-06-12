import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/require-role';
import {
  requireCapability,
  userHasCapability,
} from '@/lib/auth/require-capability';
import {
  listInventory,
  listMasterItemsForPicker,
} from '@/lib/stock/queries';
import { EmptyState } from '@/components/shared/empty-state';
import { StockTabs, type StockCategoryData } from './_components/stock-tabs';
import {
  STOCK_PAGE_CATEGORIES,
  isInventoryCategory,
  categoryFromSlug,
  CATEGORY_SLUGS,
  type InventoryCategory,
  type CategorySlug,
} from '@/lib/masters/categories';

export const dynamic = 'force-dynamic';

const DEFAULT_CATEGORY: InventoryCategory = 'alcohol';

const INVENTORY_READ = 'inventory.read';
const INVENTORY_WRITE = 'inventory.write';
const MASTERS_WRITE = 'masters.write';

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  // Normalize the active tab from `?cat=`. Handles both slugs (e.g. cold-drinks)
  // and database category names (e.g. soft_drink). Anything not one of the four
  // stockable categories falls back to the default.
  const { cat } = await searchParams;
  let category: InventoryCategory = DEFAULT_CATEGORY;

  if (cat) {
    if (isInventoryCategory(cat)) {
      category = cat;
    } else {
      const isSlug = (v: string | undefined): v is CategorySlug =>
        !!v && (CATEGORY_SLUGS as readonly string[]).includes(v);
      // 'snacks' is a UI-only alias of the 'grocery' db category, but it never
      // had its own tab on this strip — resolving it here would silently forward
      // such links into the Grocery module. Exclude it so only true grocery
      // links redirect; an unknown `cat` falls through to the default tab.
      if (isSlug(cat) && cat !== 'snacks') {
        const dbCat = categoryFromSlug(cat);
        if (isInventoryCategory(dbCat)) {
          category = dbCat;
        }
      }
    }
  }

  // Grocery stock now lives in its own Grocery module. The grocery tab was
  // removed from this strip, but keep old URLs and deep links working by
  // redirecting before the capability gate and any data fetch, so a
  // Grocery-module-only user following an old /stock?cat=grocery link is
  // transparently forwarded rather than bounced to /dashboard. Covers
  // ?cat=grocery and the db name.
  if (category === 'grocery') {
    redirect('/grocery/stock');
  }

  const user = await requireUser();
  await requireCapability(INVENTORY_READ, user.activeUnitId ?? null);

  if (!user.activeUnitId) {
    return (
      <section className="space-y-6">
        <header>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Stock
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Stock purchase lots tracked against the master catalogue.
          </p>
        </header>
        <EmptyState
          title="Pick a unit to continue"
          description="You're in all-units mode. Use the unit switcher in the navbar to choose a unit and view its inventory."
        />
      </section>
    );
  }

  const unitId = user.activeUnitId;

  // Preload every stockable category up front so the client tab strip can switch
  // instantly with no per-tab server round-trip (the old `?cat=` link nav made
  // each switch a full dynamic refetch that felt stuck). The dataset per unit is
  // small; the queries run in parallel.
  const entries = await Promise.all(
    STOCK_PAGE_CATEGORIES.map(async (cat) => {
      const [rows, masterItems] = await Promise.all([
        listInventory(unitId, { category: cat }),
        listMasterItemsForPicker(unitId, undefined, cat),
      ]);
      return [cat, { rows, masterItems }] as const;
    }),
  );
  const categoryData: Partial<Record<InventoryCategory, StockCategoryData>> =
    Object.fromEntries(entries);

  const canWrite = userHasCapability(user, INVENTORY_WRITE, unitId);
  // Inline master-item creation posts unit_id, so createMasterItemAction
  // requires the unit-scoped masters.write (admins/unit_admin bypass inside
  // userHasCapability). UI affordance only — the action is the real gate.
  const canManageMasters = userHasCapability(user, MASTERS_WRITE, unitId);

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Stock
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Purchase lots for this unit. The same item at a different price is a
          separate lot. Ration is tracked in the ration module.
        </p>
      </header>

      <StockTabs
        initialCategory={category}
        categoryData={categoryData}
        canWrite={canWrite}
        canManageMasters={canManageMasters}
      />
    </section>
  );
}

