import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { CategorySlug, Category } from './categories';
import type {
  AuthorisationChip,
  AdoptedVariantRow,
  MasterRow,
  ListMastersOpts,
} from './types';
import type { RationClass, RationTerrain } from '@/lib/schemas/ration';
import type { Database } from '@/lib/supabase/database.types';

export type {
  AuthorisationChip,
  AdoptedVariantRow,
  MasterRow,
  ListMastersOpts,
} from './types';

type MastersSearchRow = Database['public']['Views']['v_masters_search']['Row'];
type UnitType = Database['public']['Enums']['unit_type'];
type Supabase = Awaited<ReturnType<typeof createClient>>;

const CATEGORY_SLUG_IDS: Record<CategorySlug, string> = {
  alcohol: '00000000-0000-0000-0000-000000000001',
  'cold-drinks': '00000000-0000-0000-0000-000000000002',
  cigars: '00000000-0000-0000-0000-000000000003',
  snacks: '00000000-0000-0000-0000-000000000004',
  ration: '00000000-0000-0000-0000-000000000005',
  grocery: '00000000-0000-0000-0000-000000000006',
};

const CATEGORY_ROOT_IDS: Record<Category, string | null> = {
  alcohol: CATEGORY_SLUG_IDS.alcohol,
  soft_drink: CATEGORY_SLUG_IDS['cold-drinks'],
  cigar: CATEGORY_SLUG_IDS.cigars,
  grocery: CATEGORY_SLUG_IDS.grocery,
  ration: CATEGORY_SLUG_IDS.ration,
  room: null,
};

const SLUG_TO_CATEGORY: Record<CategorySlug, Category> = {
  alcohol: 'alcohol',
  'cold-drinks': 'soft_drink',
  cigars: 'cigar',
  snacks: 'grocery',
  ration: 'ration',
  grocery: 'grocery',
};

const ROOT_ID_TO_CATEGORY: Record<string, Category> = {
  [CATEGORY_SLUG_IDS.alcohol]: 'alcohol',
  [CATEGORY_SLUG_IDS['cold-drinks']]: 'soft_drink',
  [CATEGORY_SLUG_IDS.cigars]: 'cigar',
  [CATEGORY_SLUG_IDS.snacks]: 'grocery',
  [CATEGORY_SLUG_IDS.ration]: 'ration',
  [CATEGORY_SLUG_IDS.grocery]: 'grocery',
};

function categoryFromSearchRow(row: MastersSearchRow, fallback: Category = 'grocery'): Category {
  const rootId = row.category_parent_id ?? row.category_id;
  if (rootId && ROOT_ID_TO_CATEGORY[rootId]) return ROOT_ID_TO_CATEGORY[rootId];
  if (row.category_id && ROOT_ID_TO_CATEGORY[row.category_id]) {
    return ROOT_ID_TO_CATEGORY[row.category_id];
  }
  return fallback;
}

const UOM_FROM_UNIT_TYPE: Record<UnitType, string> = {
  ML: 'ml',
  LITRE: 'l',
  GRAM: 'g',
  KG: 'kg',
  PIECE: 'piece',
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function escapePostgrestValue(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function applyCategoryRoot<Q extends { or: (filters: string) => Q }>(
  query: Q,
  rootId: string,
): Q {
  return query.or(`category_id.eq.${rootId},category_parent_id.eq.${rootId}`);
}

function applyTextSearch<Q extends { or: (filters: string) => Q }>(
  query: Q,
  q: string | undefined,
): Q {
  const qClean = q?.trim() ?? '';
  if (!qClean) return query;
  const esc = escapePostgrestValue(qClean);
  return query.or(`sku.ilike."%${esc}%",product_fts.wfts."${esc}"`);
}

function packFields(row: MastersSearchRow) {
  const unitType = row.unit_type;
  const unitValue = Number(row.unit_value ?? 0);
  const packKind: 'volume' | 'count' =
    unitType === 'ML' || unitType === 'LITRE' ? 'volume' : 'count';
  let volumeMl: number | null = null;
  if (unitType === 'ML') volumeMl = unitValue;
  else if (unitType === 'LITRE') volumeMl = unitValue * 1000;
  const unitCount = unitType === 'PIECE' ? unitValue : null;
  return {
    packKind,
    volumeMl,
    unitCount,
    unitValue,
    packLabel: `${row.unit_value ?? ''} ${unitType ?? ''} ${row.package_type ?? ''}`.trim(),
    uom: unitType ? (UOM_FROM_UNIT_TYPE[unitType] ?? 'piece') : 'piece',
  };
}

function toMasterRow(
  row: MastersSearchRow,
  category: Category,
  rootId: string,
  adoption: {
    is_adopted: boolean;
    is_enabled: boolean;
    local_sku: string | null;
    menu_rate: number | null;
  },
): MasterRow {
  const pack = packFields(row);
  const parentName = row.category_parent_id === rootId ? null : row.category_name;
  return {
    id: row.variant_id ?? '',
    unit_id: null,
    category,
    name: row.product_name ?? '',
    sku: row.sku,
    uom: pack.uom,
    is_active: row.is_active ?? false,
    current_rate: adoption.menu_rate,
    current_ration_scale: null,
    rate_valid_from: row.created_at,
    version_id: row.variant_id,
    updated_at: row.updated_at ?? row.created_at ?? '',
    pack_size_id: null,
    pack_label: pack.packLabel,
    pack_kind: pack.packKind,
    volume_ml: pack.volumeMl,
    unit_count: pack.unitCount,
    product_id: row.product_id ?? undefined,
    product_name: row.product_name ?? undefined,
    product_description: row.product_description,
    category_name: row.category_name ?? undefined,
    subcategory_name: parentName,
    unit_value: pack.unitValue,
    unit_type: row.unit_type ?? undefined,
    package_type: row.package_type ?? undefined,
    is_adopted: adoption.is_adopted,
    is_enabled: adoption.is_enabled,
    local_sku: adoption.local_sku,
    menu_rate: adoption.menu_rate,
  };
}

const EMPTY_ADOPTION = {
  is_adopted: false,
  is_enabled: false,
  local_sku: null,
  menu_rate: null,
} as const;

async function fetchAdoptionByVariant(
  supabase: Supabase,
  unitId: string,
  variantIds: string[],
): Promise<Map<string, { local_sku: string | null; is_enabled: boolean }>> {
  const out = new Map<string, { local_sku: string | null; is_enabled: boolean }>();
  if (variantIds.length === 0) return out;
  const { data, error } = await supabase
    .from('unit_catalog')
    .select('variant_id, local_sku, is_enabled')
    .eq('unit_id', unitId)
    .in('variant_id', variantIds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    out.set(row.variant_id, {
      local_sku: row.local_sku,
      is_enabled: row.is_enabled,
    });
  }
  return out;
}

async function fetchMenuRatesByVariant(
  supabase: Supabase,
  unitId: string,
  variantIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (variantIds.length === 0) return out;
  const { data, error } = await supabase
    .from('unit_menu_rates')
    .select('variant_id, rate, effective_from')
    .eq('unit_id', unitId)
    .in('variant_id', variantIds)
    .lte('effective_from', todayIsoDate())
    .order('effective_from', { ascending: false });
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    if (!out.has(row.variant_id)) out.set(row.variant_id, Number(row.rate));
  }
  return out;
}

export async function listMasterItems(
  categorySlug: CategorySlug,
  opts: ListMastersOpts,
): Promise<{ rows: MasterRow[]; totalCount: number }> {
  const supabase = await createClient();
  const catId = CATEGORY_SLUG_IDS[categorySlug];
  const category = SLUG_TO_CATEGORY[categorySlug];

  let query = supabase.from('v_masters_search').select('*', { count: 'exact' });
  query = applyCategoryRoot(query, catId);

  if (!opts.includeInactive) {
    query = query.eq('is_active', true);
  }

  query = applyTextSearch(query, opts.q);

  const sortBy = opts.sortBy || 'name';
  const sortOrder = opts.sortOrder || 'asc';
  const ascending = sortOrder === 'asc';

  if (sortBy === 'name') {
    query = query.order('product_name', { ascending }).order('unit_value', { ascending: true });
  } else if (sortBy === 'sku') {
    query = query.order('sku', { ascending });
  } else if (sortBy === 'updated_at') {
    query = query.order('updated_at', { ascending });
  } else if (sortBy === 'unit_value') {
    query = query.order('unit_value', { ascending });
  } else {
    query = query.order('product_name', { ascending: true }).order('unit_value', { ascending: true });
  }

  if (opts.page && opts.pageSize) {
    const from = (opts.page - 1) * opts.pageSize;
    const to = from + opts.pageSize - 1;
    query = query.range(from, to);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const viewRows = (data ?? []).filter((v): v is MastersSearchRow & { variant_id: string } =>
    Boolean(v.variant_id),
  );
  const variantIds = viewRows.map((v) => v.variant_id);

  const attachUnit = !opts.isAllUnits && opts.activeUnitId ? opts.activeUnitId : null;
  const [adoption, rates] = attachUnit
    ? await Promise.all([
        fetchAdoptionByVariant(supabase, attachUnit, variantIds),
        fetchMenuRatesByVariant(supabase, attachUnit, variantIds),
      ])
    : [new Map<string, { local_sku: string | null; is_enabled: boolean }>(), new Map<string, number>()];

  const rows = viewRows.map((v) => {
    const adopted = adoption.get(v.variant_id);
    return toMasterRow(v, category, catId, {
      is_adopted: Boolean(adopted),
      is_enabled: adopted?.is_enabled ?? false,
      local_sku: adopted?.local_sku ?? null,
      menu_rate: rates.get(v.variant_id) ?? null,
    });
  });

  return {
    rows,
    totalCount: count ?? rows.length,
  };
}

export async function listAdoptedVariants(
  unitId: string,
  category?: Category,
): Promise<AdoptedVariantRow[]> {
  const supabase = await createClient();
  const rootId = category ? CATEGORY_ROOT_IDS[category] : undefined;
  if (category && rootId === null) return [];

  const { data: adopted, error: adoptedErr } = await supabase
    .from('unit_catalog')
    .select('variant_id, local_sku, is_enabled')
    .eq('unit_id', unitId)
    .eq('is_enabled', true);
  if (adoptedErr) throw new Error(adoptedErr.message);

  const adoptedRows = adopted ?? [];
  if (adoptedRows.length === 0) return [];

  const adoptedByVariant = new Map(
    adoptedRows.map((row) => [row.variant_id, row] as const),
  );
  const variantIds = adoptedRows.map((row) => row.variant_id);

  let query = supabase
    .from('v_masters_search')
    .select('*')
    .in('variant_id', variantIds)
    .eq('is_active', true)
    .order('product_name', { ascending: true })
    .order('unit_value', { ascending: true });

  if (rootId) query = applyCategoryRoot(query, rootId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const viewRows = (data ?? []).filter((v): v is MastersSearchRow & { variant_id: string } =>
    Boolean(v.variant_id),
  );
  const rates = await fetchMenuRatesByVariant(
    supabase,
    unitId,
    viewRows.map((v) => v.variant_id),
  );

  return viewRows.map((v) => {
    const pack = packFields(v);
    const adoption = adoptedByVariant.get(v.variant_id);
    const mappedCategory = category ?? categoryFromSearchRow(v);
    return {
      variant_id: v.variant_id,
      product_id: v.product_id ?? '',
      name: v.product_name ?? '',
      sku: v.sku,
      local_sku: adoption?.local_sku ?? null,
      category: mappedCategory,
      category_name: v.category_name,
      uom: pack.uom,
      pack_label: pack.packLabel,
      pack_kind: pack.packKind,
      volume_ml: pack.volumeMl,
      unit_count: pack.unitCount,
      unit_value: pack.unitValue,
      unit_type: v.unit_type ?? '',
      package_type: v.package_type ?? '',
      menu_rate: rates.get(v.variant_id) ?? null,
      is_enabled: adoption?.is_enabled ?? true,
    };
  });
}

export async function searchGlobalCatalog(
  q: string,
  category: Category,
): Promise<MasterRow[]> {
  const rootId = CATEGORY_ROOT_IDS[category];
  if (!rootId) return [];

  const supabase = await createClient();
  let query = supabase.from('v_masters_search').select('*').eq('is_active', true);
  query = applyCategoryRoot(query, rootId);
  query = applyTextSearch(query, q);
  query = query
    .order('product_name', { ascending: true })
    .order('unit_value', { ascending: true })
    .limit(50);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((v): v is MastersSearchRow & { variant_id: string } => Boolean(v.variant_id))
    .map((v) => toMasterRow(v, category, rootId, EMPTY_ADOPTION));
}

export async function getCurrentMenuRate(
  unitId: string,
  variantId: string,
): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('unit_menu_rates')
    .select('rate')
    .eq('unit_id', unitId)
    .eq('variant_id', variantId)
    .lte('effective_from', todayIsoDate())
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? Number(data.rate) : null;
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
