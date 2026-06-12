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
import { StockTable } from './_components/stock-table';
import { InventoryCategoryNav } from './_components/stock-category-nav';
import {
  CATEGORY_META,
  isInventoryCategory,
  slugFromCategory,
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
  const user = await requireUser();
  await requireCapability(INVENTORY_READ, user.activeUnitId ?? null);

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
      if (isSlug(cat)) {
        const dbCat = categoryFromSlug(cat);
        if (isInventoryCategory(dbCat)) {
          category = dbCat;
        }
      }
    }
  }

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
  const [rows, masterItems] = await Promise.all([
    listInventory(unitId, { category }),
    listMasterItemsForPicker(unitId, undefined, category),
  ]);

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

      <InventoryCategoryNav active={category} />

      <StockTable
        category={category}
        categoryLabel={CATEGORY_META[slugFromCategory(category)]?.title ?? category}
        rows={rows}
        masterItems={masterItems}
        canWrite={canWrite}
        canManageMasters={canManageMasters}
      />
    </section>
  );
}

