import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type {
  InventoryLotRow,
  ListInventoryOpts,
  MasterItemPick,
} from './types';
import type { InventoryCategory } from '@/lib/masters/categories';

// Current inventory lots for a unit.
// - If `unitId` is null (admin in "All units" mode) return [] so the page can
//   render the same empty-state pattern as /ration — there is no all-units
//   inventory roll-up in Phase 1.
// - Otherwise query the current-lots view scoped to the unit. The cookies-aware
//   client is used so RLS applies on top of the explicit capability gate.
export async function listInventory(
  unitId: string | null,
  opts: ListInventoryOpts = {},
): Promise<{ rows: InventoryLotRow[]; totalCount: number }> {
  if (unitId === null) return { rows: [], totalCount: 0 };

  const supabase = await createClient();
  let q = supabase
    .from('v_unit_inventory_current')
    .select(
      'id, unit_id, item_id, item_name, category, pack_size_id, pack_label, kind, volume_ml, unit_count, qty_packs, rate, acquired_on, source, uom, is_active, created_at, created_by, updated_at, updated_by',
      { count: 'exact' }
    )
    .eq('unit_id', unitId)
    // Ration is scale-derived and lives only in the ration module — it is
    // never a stockable inventory lot. Exclude it defensively even when no
    // category filter is supplied so it can never leak into any tab.
    .neq('category', 'ration');

  if (opts.category) q = q.eq('category', opts.category);
  if (!opts.includeInactive) q = q.eq('is_active', true);
  if (opts.q) q = q.ilike('item_name', `%${opts.q}%`);
  if (opts.itemId) q = q.eq('item_id', opts.itemId);

  const ascending = opts.sortOrder === 'desc' ? false : true;
  let sortByCol = 'item_name';
  if (opts.sortBy === 'qty') sortByCol = 'qty_packs';
  else if (opts.sortBy === 'rate') sortByCol = 'rate';
  else if (opts.sortBy === 'acquired') sortByCol = 'acquired_on';
  else if (opts.sortBy === 'source') sortByCol = 'source';

  q = q.order(sortByCol, { ascending });
  if (sortByCol !== 'item_name') {
    q = q.order('item_name', { ascending: true });
  }

  // Pagination
  if (opts.page && opts.pageSize) {
    const from = (opts.page - 1) * opts.pageSize;
    const to = from + opts.pageSize - 1;
    q = q.range(from, to);
  }

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  
  return {
    rows: (data ?? []) as InventoryLotRow[],
    totalCount: count ?? (data?.length ?? 0),
  };
}

// Master items for the add-lot picker, scoped to the active inventory tab's
// category. Ration is a HARD exclude (scale-derived, ration-module only) — it
// can never appear in the picker regardless of `category`. When `category` is
// given the picker is restricted to that one category so a lot cannot be
// opened against a wrong-category master from a tab. Queries the current-items
// view directly via the cookies-aware client (RLS applies on top of the
// page's explicit capability gate). Includes the unit's own items plus the
// global (unit_id is null) catalogue.
export async function listMasterItemsForPicker(
  unitId: string | null,
  q?: string,
  category?: InventoryCategory,
): Promise<MasterItemPick[]> {
  const supabase = await createClient();
  let query = supabase
    .from('v_items_current')
    .select('id, name, category, uom, pack_label, pack_kind, volume_ml, unit_count')
    .eq('is_active', true)
    // Hard exclude ration even if no category is passed.
    .neq('category', 'ration')
    .order('name')
    .limit(50);

  if (category) query = query.eq('category', category);

  if (unitId === null) {
    query = query.is('unit_id', null);
  } else {
    query = query.or(`unit_id.is.null,unit_id.eq.${unitId}`);
  }
  if (q) query = query.ilike('name', `%${q}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MasterItemPick[];
}
