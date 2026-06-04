import { requireUser } from '@/lib/auth/require-role';
import {
  requireCapability,
  userHasCapability,
} from '@/lib/auth/require-capability';
import {
  listInventory,
  listPackSizes,
  listMasterItemsForPicker,
} from '@/lib/inventory/queries';
import { EmptyState } from '@/components/shared/empty-state';
import { InventoryTable } from './_components/inventory-table';
import { InventoryCategoryNav } from './_components/inventory-category-nav';
import {
  CATEGORY_META,
  CATEGORY_PACK_KIND,
  isInventoryCategory,
  type InventoryCategory,
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

  // Normalize the active tab from `?cat=`. Anything not one of the four
  // stockable categories (including `ration`) falls back to the default —
  // ration can never be selected.
  const { cat } = await searchParams;
  const category: InventoryCategory = isInventoryCategory(cat)
    ? cat
    : DEFAULT_CATEGORY;

  if (!user.activeUnitId) {
    return (
      <section className="space-y-6">
        <header>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Inventory
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Per-unit purchase lots tracked against the master catalogue.
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
  // Pack sizes are typed per category: alcohol/soft_drink use volume-kind
  // sizes, cigar/grocery use count-kind sizes. Filter at the source so the
  // picker and dialogs only ever see sensible options for the active tab.
  const packKind = CATEGORY_PACK_KIND[category];
  const [rows, packSizes, masterItems] = await Promise.all([
    listInventory(unitId, { category }),
    listPackSizes(packKind),
    listMasterItemsForPicker(unitId, undefined, category),
  ]);

  const canWrite = userHasCapability(user, INVENTORY_WRITE, unitId);
  const canManagePackSizes = userHasCapability(user, MASTERS_WRITE, null);
  // Inline master-item creation posts unit_id, so createMasterItemAction
  // requires the unit-scoped masters.write (admins/unit_admin bypass inside
  // userHasCapability). UI affordance only — the action is the real gate.
  const canManageMasters = userHasCapability(user, MASTERS_WRITE, unitId);

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Inventory
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Purchase lots for this unit. The same item at a different price is a
          separate lot. Ration is tracked in the ration module.
        </p>
      </header>

      <InventoryCategoryNav active={category} />

      <InventoryTable
        unitId={unitId}
        category={category}
        categoryLabel={CATEGORY_META[category].title}
        rows={rows}
        packSizes={packSizes}
        masterItems={masterItems}
        canWrite={canWrite}
        canManagePackSizes={canManagePackSizes}
        canManageMasters={canManageMasters}
      />
    </section>
  );
}
