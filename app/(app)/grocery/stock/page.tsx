import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/require-role';
import { userHasCapability } from '@/lib/auth/require-capability';
import { listInventory } from '@/lib/stock/queries';
import { EmptyState } from '@/components/shared/empty-state';
import { StockTable } from '@/app/(app)/_shared/stock-table/stock-table';
import {
  CATEGORY_META,
  slugFromCategory,
  type InventoryCategory,
} from '@/lib/masters/categories';

export const dynamic = 'force-dynamic';

// Grocery stock is hard-locked to the `grocery` stockable category — this
// module's own nav replaces the shared /stock category tab strip.
const GROCERY_CATEGORY: InventoryCategory = 'grocery';

const INVENTORY_READ = 'inventory.read';
const INVENTORY_WRITE = 'inventory.write';
const MASTERS_WRITE = 'masters.write';

export default async function GroceryStockPage() {
  // Single Supabase SSR round trip: fetch the user once, then gate against the
  // active unit with the pure helper instead of calling requireCapability
  // (which would re-run requireUser internally). Keeps the unit-scoped check.
  const user = await requireUser();
  if (!userHasCapability(user, INVENTORY_READ, user.activeUnitId ?? null)) {
    redirect('/dashboard');
  }

  if (!user.activeUnitId) {
    return (
      <section className="space-y-6">
        <header>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            Grocery stock
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Grocery purchase lots tracked against the master catalogue.
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
  const rows = await listInventory(unitId, { category: GROCERY_CATEGORY });
  const masterItems: any[] = [];

  const canWrite = userHasCapability(user, INVENTORY_WRITE, unitId);
  // Inline master-item creation posts unit_id, so createMasterItemAction
  // requires the unit-scoped masters.write (admins/unit_admin bypass inside
  // userHasCapability). UI affordance only — the action is the real gate.
  const canManageMasters = userHasCapability(user, MASTERS_WRITE, unitId);

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Grocery stock
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Grocery purchase lots for this unit. The same item at a different
          price is a separate lot.
        </p>
      </header>

      <StockTable
        category={GROCERY_CATEGORY}
        categoryLabel={
          CATEGORY_META[slugFromCategory(GROCERY_CATEGORY)]?.title ?? 'Grocery'
        }
        rows={rows}
        masterItems={masterItems}
        canWrite={canWrite}
        canManageMasters={canManageMasters}
      />
    </section>
  );
}
