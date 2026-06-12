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
  categoryFromSlug,
  CATEGORY_SLUGS,
  type CategorySlug,
  type InventoryCategory,
} from '@/lib/masters/categories';

export const dynamic = 'force-dynamic';

const DEFAULT_CATEGORY: CategorySlug = 'alcohol';

const INVENTORY_READ = 'inventory.read';
const INVENTORY_WRITE = 'inventory.write';
const MASTERS_WRITE = 'masters.write';


export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    cat?: string;
    q?: string;
    page?: string;
    sortBy?: string;
    sortOrder?: string;
  }>;
}) {
  const { cat, q, page, sortBy, sortOrder } = await searchParams;
  let categorySlug: CategorySlug = DEFAULT_CATEGORY;

  if (cat) {
    if ((CATEGORY_SLUGS as readonly string[]).includes(cat)) {
      categorySlug = cat as CategorySlug;
    }
  }

  // Redirect 'grocery' category slug to the new grocery stock page.
  // Snacks tab uses 'grocery' internally but stays in the stock page.
  if (categorySlug === 'grocery') {
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

  // Pagination parameters
  const currentPage = Number(page) || 1;
  const pageSize = 15;

  // Query only the active tab's data from the backend
  const dbCat = categoryFromSlug(categorySlug) as InventoryCategory;
  const [{ rows, totalCount }, masterItems] = await Promise.all([
    listInventory(unitId, {
      category: dbCat,
      q: q || undefined,
      page: currentPage,
      pageSize,
      sortBy: sortBy || undefined,
      sortOrder: (sortOrder as 'asc' | 'desc') || undefined,
    }),
    listMasterItemsForPicker(unitId, undefined, dbCat),
  ]);

  const categoryData = {
    [categorySlug]: { rows, masterItems, totalCount },
  } as Record<CategorySlug, StockCategoryData>;

  const canWrite = userHasCapability(user, INVENTORY_WRITE, unitId);
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
        initialCategory={categorySlug}
        categoryData={categoryData}
        canWrite={canWrite}
        canManageMasters={canManageMasters}
        currentPage={currentPage}
        pageSize={pageSize}
        q={q || ''}
        sortBy={sortBy || 'item_name'}
        sortOrder={(sortOrder as 'asc' | 'desc') || 'asc'}
      />
    </section>
  );
}

