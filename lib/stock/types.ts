// Shared inventory row types derived from the generated DB types.
//
// IMPORTANT: do NOT add `import 'server-only'` here. Client components must be
// able to `import type { ... }` these shapes; a `server-only` module would
// still get resolved by Turbopack and break the client bundle (known footgun
// #2 — shared row types live in a non-`server-only` file, queries.ts re-exports).
import type { Database } from '@/lib/supabase/database.types';
import type { Category, InventoryCategory } from '@/lib/masters/categories';

// One current inventory lot for a unit, as projected by the
// `v_unit_inventory_current` view (joins item + pack-size metadata).
export type InventoryLotRow =
  Database['public']['Views']['v_unit_inventory_current']['Row'];

// Options accepted by `listInventory` to filter the current-lots view.
export type ListInventoryOpts = {
  q?: string;
  itemId?: string;
  includeInactive?: boolean;
  // Restrict to one inventory category (alcohol | soft_drink | cigar |
  // grocery). Ration is ALWAYS excluded regardless of this value.
  category?: InventoryCategory;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

// Minimal master-item shape for the add-lot picker. Lots can be opened off ANY
// master category (alcohol, cigar, soft_drink, ration, grocery), so the picker
// surfaces the category alongside the name to disambiguate ("Old Monk Rum
// (alcohol)"). Kept tiny on purpose — the picker only needs id/name/category/uom/pack_label.
export type MasterItemPick = {
  id: string;
  name: string;
  category: Category;
  uom: string;
  pack_label: string;
  pack_kind: 'volume' | 'count' | null;
  volume_ml: number | null;
  unit_count: number | null;
};
