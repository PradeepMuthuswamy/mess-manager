import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { CategorySlug, Category } from './categories';
import type {
  AuthorisationChip,
  MasterRow,
  ListMastersOpts,
} from './types';
import type { RationClass, RationTerrain } from '@/lib/schemas/ration';

export type { AuthorisationChip, MasterRow, ListMastersOpts } from './types';

export async function listMasterItems(categorySlug: CategorySlug, opts: ListMastersOpts): Promise<{ rows: MasterRow[]; totalCount: number }> {
  const supabase = await createClient();
  
  // Define category UUIDs for main parent categories
  const categoryIds: Record<CategorySlug, string> = {
    alcohol: '00000000-0000-0000-0000-000000000001',
    'cold-drinks': '00000000-0000-0000-0000-000000000002',
    cigars: '00000000-0000-0000-0000-000000000003',
    snacks: '00000000-0000-0000-0000-000000000004',
    ration: '00000000-0000-0000-0000-000000000005',
    grocery: '00000000-0000-0000-0000-000000000006',
  };
  const catId = categoryIds[categorySlug];

  let query = supabase
    .from('v_masters_search')
    .select('*', { count: 'exact' });

  // Filter by category_id or category_parent_id matching catId
  query = query.or(`category_id.eq.${catId},category_parent_id.eq.${catId}`);

  if (!opts.includeInactive) {
    query = query.eq('is_active', true);
  }
  
  if (opts.q) {
    const qClean = opts.q.trim();
    if (qClean) {
      // Full-text search on product_fts OR B-tree search on variant SKU.
      // Values are double-quoted (with " and \ escaped) so user input containing
      // PostgREST filter syntax (commas, parentheses) can't break or inject into
      // the or() expression — e.g. searching for `Vegetables (Fresh)`.
      const esc = qClean.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      query = query.or(`sku.ilike."%${esc}%",product_fts.wfts."${esc}"`);
    }
  }
  
  if (!opts.isAllUnits && opts.activeUnitId) {
    query = query.or(`product_unit_id.is.null,product_unit_id.eq.${opts.activeUnitId}`);
  }

  // Sort logic
  const sortBy = opts.sortBy || 'name';
  const sortOrder = opts.sortOrder || 'asc';
  const ascending = sortOrder === 'asc';

  if (sortBy === 'name') {
    query = query
      .order('product_name', { ascending })
      .order('unit_value', { ascending: true });
  } else if (sortBy === 'sku') {
    query = query.order('sku', { ascending });
  } else if (sortBy === 'updated_at') {
    query = query.order('updated_at', { ascending });
  } else if (sortBy === 'unit_value') {
    query = query.order('unit_value', { ascending });
  } else {
    // Default sorting
    query = query
      .order('product_name', { ascending: true })
      .order('unit_value', { ascending: true });
  }

  // Pagination logic
  if (opts.page && opts.pageSize) {
    const from = (opts.page - 1) * opts.pageSize;
    const to = from + opts.pageSize - 1;
    query = query.range(from, to);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const uomMap: Record<string, string> = {
    'ML': 'ml',
    'LITRE': 'l',
    'GRAM': 'g',
    'KG': 'kg',
    'PIECE': 'piece'
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((v: any) => {
    const parentName = v.category_parent_id === catId ? null : v.category_name;
    
    const packKind = ['ML', 'LITRE'].includes(v.unit_type) ? 'volume' : 'count';
    
    let volumeMl: number | null = null;
    if (v.unit_type === 'ML') {
      volumeMl = Number(v.unit_value);
    } else if (v.unit_type === 'LITRE') {
      volumeMl = Number(v.unit_value) * 1000;
    }
    
    const unitCount = v.unit_type === 'PIECE' ? Number(v.unit_value) : null;
    
    const categoryEnumMap: Record<CategorySlug, Category> = {
      alcohol: 'alcohol',
      'cold-drinks': 'soft_drink',
      cigars: 'cigar',
      snacks: 'grocery',
      ration: 'ration',
      grocery: 'grocery'
    };

    return {
      id: v.variant_id,
      unit_id: v.product_unit_id,
      category: categoryEnumMap[categorySlug] || 'grocery',
      name: v.product_name,
      sku: v.sku,
      uom: uomMap[v.unit_type] || 'piece',
      is_active: v.is_active,
      // Rates live on inventory lots since the products/variants refactor;
      // null signals "no master-level rate" instead of a misleading 0.
      current_rate: null,
      current_ration_scale: null,
      rate_valid_from: v.created_at,
      version_id: v.variant_id,
      updated_at: v.updated_at,
      pack_size_id: null,
      pack_label: `${v.unit_value} ${v.unit_type} ${v.package_type}`,
      pack_kind: packKind as 'volume' | 'count',
      volume_ml: volumeMl,
      unit_count: unitCount,
      // Variant-specific fields for UI
      product_id: v.product_id,
      product_name: v.product_name,
      product_description: v.product_description,
      category_name: v.category_name,
      subcategory_name: parentName,
      unit_value: Number(v.unit_value),
      unit_type: v.unit_type,
      package_type: v.package_type,
    } as MasterRow;
  });

  return {
    rows,
    totalCount: count ?? rows.length,
  };
}


// Per-item ration authorisations. Returns a Map keyed by item_id, each value
// an array of (scale, rank_class, terrain, qty, uom) entries.
// - If unitId is provided, restrict to that unit.
// - If unitId is null (admin in "All units" mode), pull authorisations from
//   every unit so the masters page still surfaces the terrain mapping.
// - `restrict` (optional) narrows the result to a single rank_class and/or
//   terrain — used by the unit-scoped /masters view so non-super-admins only
//   see their unit's configured scale. Omitting it preserves prior behaviour.
export async function listMasterAuthorisations(
  unitId: string | null,
  restrict?: { rankClass?: RationClass | null; terrain?: RationTerrain | null },
): Promise<Map<string, AuthorisationChip[]>> {
  const out = new Map<string, AuthorisationChip[]>();

  const supabase = await createClient();
  let q = supabase
    .from('v_ration_scale_items_current')
    .select('scale_id, scale_name, item_id, rank_class, terrain, auth_qty, uom');
  if (unitId) q = q.eq('unit_id', unitId);
  if (restrict?.rankClass) q = q.eq('rank_class', restrict.rankClass);
  if (restrict?.terrain) q = q.eq('terrain', restrict.terrain);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    if (!row.item_id || !row.scale_id) continue;
    const list = out.get(row.item_id) ?? [];
    list.push({
      scale_id: row.scale_id,
      scale_name: row.scale_name ?? '',
      rank_class: (row.rank_class as RationClass) ?? 'officer',
      terrain: (row.terrain as RationTerrain) ?? 'plains',
      auth_qty: Number(row.auth_qty ?? 0),
      uom: (row.uom as string | null) ?? '',
    });
    out.set(row.item_id, list);
  }

  // Sort chips deterministically: rank_class then terrain.
  for (const [, list] of out) {
    list.sort((a, b) => {
      const r = a.rank_class.localeCompare(b.rank_class);
      if (r !== 0) return r;
      return a.terrain.localeCompare(b.terrain);
    });
  }
  return out;
}

