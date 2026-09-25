import 'server-only';
import { getDb } from '@/lib/mongo';
import type { CategorySlug, Category } from './categories';
import type {
  AuthorisationChip,
  MasterRow,
  ListMastersOpts,
  MongoCategory,
  MongoProduct,
  MongoVariant,
} from './types';
import type { RationClass, RationTerrain } from '@/lib/schemas/ration';

export type { AuthorisationChip, MasterRow, ListMastersOpts } from './types';

export async function listCategories(): Promise<MongoCategory[]> {
  const db = await getDb();
  const cats = await db.collection('categories').find({}).toArray();
  return cats.map((c) => ({
    id: String(c.id || c._id),
    name: String(c.name),
    parent_id: c.parent_id ? String(c.parent_id) : null,
    slug: c.slug ? String(c.slug) : undefined,
  }));
}

export async function listMasterItems(
  categorySlug: CategorySlug,
  opts: ListMastersOpts,
): Promise<{ rows: MasterRow[]; totalCount: number }> {
  const db = await getDb();

  const categoryIds: Record<CategorySlug, string> = {
    alcohol: '00000000-0000-0000-0000-000000000001',
    'cold-drinks': '00000000-0000-0000-0000-000000000002',
    cigars: '00000000-0000-0000-0000-000000000003',
    snacks: '00000000-0000-0000-0000-000000000004',
    ration: '00000000-0000-0000-0000-000000000005',
    grocery: '00000000-0000-0000-0000-000000000006',
  };
  const catId = categoryIds[categorySlug];

  // 1. Get matching categories
  const categories = await db
    .collection('categories')
    .find({
      $or: [{ id: catId }, { parent_id: catId }, { slug: categorySlug }],
    })
    .toArray();
  const catMap = new Map(categories.map((c) => [String(c.id || c._id), c]));
  const matchedCatIds = Array.from(catMap.keys());
  matchedCatIds.push(catId);

  // 2. Query products
  const productFilter: Record<string, unknown> = {
    category_id: { $in: matchedCatIds },
  };
  if (opts.q?.trim()) {
    const regex = new RegExp(opts.q.trim(), 'i');
    productFilter.$or = [{ name: regex }, { name_normalized: regex }];
  }

  const products = (await db
    .collection('products')
    .find(productFilter)
    .toArray()) as unknown as MongoProduct[];
  const prodMap = new Map(products.map((p) => [String(p.id || p._id), p]));
  const productIds = Array.from(prodMap.keys());

  // 3. Query variants
  const variantFilter: Record<string, unknown> = {
    product_id: { $in: productIds },
  };
  if (!opts.includeInactive) {
    variantFilter.is_active = { $ne: false };
  }

  let variantDocs = (await db
    .collection('product_variants')
    .find(variantFilter)
    .toArray()) as unknown as MongoVariant[];

  // Also match SKU if q provided
  if (opts.q?.trim()) {
    const qLower = opts.q.trim().toLowerCase();
    variantDocs = variantDocs.filter((v) => {
      const p = prodMap.get(String(v.product_id));
      const nameMatch = p?.name?.toLowerCase().includes(qLower);
      const skuMatch = v.sku?.toLowerCase().includes(qLower);
      return nameMatch || skuMatch;
    });
  }

  const uomMap: Record<string, string> = {
    ML: 'ml',
    LITRE: 'l',
    GRAM: 'g',
    KG: 'kg',
    PIECE: 'piece',
  };

  const categoryEnumMap: Record<CategorySlug, Category> = {
    alcohol: 'alcohol',
    'cold-drinks': 'soft_drink',
    cigars: 'cigar',
    snacks: 'grocery',
    ration: 'ration',
    grocery: 'grocery',
  };

  const variantIds = variantDocs.map((v) => String(v.id || v._id));
  const catalogMap = new Map<string, { is_enabled: boolean; local_sku: string | null }>();
  const menuRateMap = new Map<string, number>();

  if (opts.activeUnitId) {
    const catalogDocs = await db
      .collection('unit_catalog')
      .find({
        unit_id: opts.activeUnitId,
        variant_id: { $in: variantIds },
      })
      .toArray();

    for (const c of catalogDocs) {
      catalogMap.set(String(c.variant_id), {
        is_enabled: c.is_enabled !== undefined ? Boolean(c.is_enabled) : (c.is_active !== undefined ? Boolean(c.is_active) : true),
        local_sku: c.local_sku ? String(c.local_sku) : null,
      });
    }

    const rates = await db
      .collection('unit_menu_rates')
      .find({
        unit_id: opts.activeUnitId,
        variant_id: { $in: variantIds },
      })
      .sort({ effective_from: -1 })
      .toArray();

    for (const r of rates) {
      const vId = String(r.variant_id);
      if (!menuRateMap.has(vId)) {
        menuRateMap.set(vId, Number(r.rate));
      }
    }
  }

  const rows: MasterRow[] = variantDocs.map((v) => {
    const vId = String(v.id || v._id);
    const product = prodMap.get(String(v.product_id));
    const cat = product?.category_id ? catMap.get(String(product.category_id)) : undefined;
    const parentName = cat?.parent_id === catId ? null : (cat?.name ?? null);

    const packKind = ['ML', 'LITRE'].includes(String(v.unit_type)) ? 'volume' : 'count';
    let volumeMl: number | null = null;
    if (v.unit_type === 'ML') {
      volumeMl = Number(v.unit_value);
    } else if (v.unit_type === 'LITRE') {
      volumeMl = Number(v.unit_value) * 1000;
    }

    const unitCount = v.unit_type === 'PIECE' ? Number(v.unit_value) : null;
    const catalogEntry = catalogMap.get(vId);
    const isAdopted = Boolean(catalogEntry);
    const isEnabled = catalogEntry ? catalogEntry.is_enabled : false;
    const localSku = catalogEntry?.local_sku ?? null;
    const menuRate = menuRateMap.get(vId) ?? null;

    return {
      id: vId,
      unit_id: null,
      category: categoryEnumMap[categorySlug] || 'grocery',
      name: product?.name || '',
      sku: v.sku ?? null,
      uom: (v.unit_type && uomMap[v.unit_type]) || v.uom || 'piece',
      is_active: v.is_active ?? true,
      current_rate: menuRate,
      current_ration_scale: null,
      rate_valid_from: null,
      version_id: vId,
      updated_at: new Date().toISOString(),
      pack_size_id: null,
      pack_label: `${v.unit_value || 1} ${v.unit_type || ''} ${v.package_type || ''}`.trim(),
      pack_kind: packKind as 'volume' | 'count',
      volume_ml: volumeMl,
      unit_count: unitCount,
      product_id: String(product?.id || v.product_id),
      product_name: product?.name || '',
      product_description: product?.description || null,
      category_name: cat?.name || '',
      subcategory_name: parentName || null,
      unit_value: v.unit_value ? Number(v.unit_value) : undefined,
      unit_type: v.unit_type,
      package_type: v.package_type,
      is_adopted: isAdopted,
      is_enabled: isEnabled,
      local_sku: localSku,
      menu_rate: menuRate,
    };
  });

  // Sort
  const sortBy = opts.sortBy || 'name';
  const ascending = (opts.sortOrder || 'asc') === 'asc';
  rows.sort((a, b) => {
    if (sortBy === 'name') {
      const cmp = a.name.localeCompare(b.name);
      return ascending ? cmp : -cmp;
    }
    if (sortBy === 'sku') {
      const cmp = (a.sku || '').localeCompare(b.sku || '');
      return ascending ? cmp : -cmp;
    }
    return 0;
  });

  const totalCount = rows.length;
  const page = opts.page || 1;
  const pageSize = opts.pageSize || 50;
  const paginatedRows = rows.slice((page - 1) * pageSize, page * pageSize);

  return {
    rows: paginatedRows,
    totalCount,
  };
}

export async function listMasterAuthorisations(
  unitId: string | null,
  restrict?: { rankClass?: RationClass | null; terrain?: RationTerrain | null },
): Promise<Map<string, AuthorisationChip[]>> {
  const out = new Map<string, AuthorisationChip[]>();
  const db = await getDb();

  const scaleFilter: Record<string, unknown> = {};
  if (unitId) scaleFilter.unit_id = unitId;
  if (restrict?.rankClass) scaleFilter.rank_class = restrict.rankClass;
  if (restrict?.terrain) scaleFilter.terrain = restrict.terrain;

  const scales = await db.collection('ration_scales').find(scaleFilter).toArray();
  const scaleMap = new Map(scales.map((s) => [String(s.id || s._id), s]));
  const scaleIds = Array.from(scaleMap.keys());

  const items = await db
    .collection('ration_scale_item_versions')
    .find({
      scale_id: { $in: scaleIds },
      valid_to: null,
    })
    .toArray();

  for (const row of items) {
    const scale = scaleMap.get(String(row.scale_id));
    if (!scale) continue;
    const itemId = String(row.variant_id || row.item_id);
    if (!itemId) continue;

    const list = out.get(itemId) ?? [];
    list.push({
      scale_id: String(scale.id || scale._id),
      scale_name: String(scale.name || ''),
      rank_class: (scale.rank_class as RationClass) ?? 'officer',
      terrain: (scale.terrain as RationTerrain) ?? 'plains',
      auth_qty: Number(row.auth_qty ?? 0),
      uom: String(row.uom ?? ''),
    });
    out.set(itemId, list);
  }

  for (const [, list] of out) {
    list.sort((a, b) => {
      const r = a.rank_class.localeCompare(b.rank_class);
      if (r !== 0) return r;
      return a.terrain.localeCompare(b.terrain);
    });
  }

  return out;
}

export interface ItemCurrentRow {
  id: string;
  variant_id: string;
  product_id: string;
  name: string;
  category: string;
  category_name?: string;
  uom: string;
  unit_value?: number;
  unit_type?: string;
  package_type?: string;
  pack_label?: string | null;
  pack_kind?: 'volume' | 'count' | null;
  volume_ml?: number | null;
  unit_count?: number | null;
  is_active: boolean;
}

export async function listItemsCurrent(opts: {
  category?: string;
  activeOnly?: boolean;
  q?: string;
  limit?: number;
} = {}): Promise<ItemCurrentRow[]> {
  const db = await getDb();

  const pipeline: Record<string, unknown>[] = [];

  const variantMatch: Record<string, unknown> = {};
  if (opts.activeOnly) {
    variantMatch.is_active = { $ne: false };
  }
  if (Object.keys(variantMatch).length > 0) {
    pipeline.push({ $match: variantMatch });
  }

  pipeline.push({
    $lookup: {
      from: 'products',
      localField: 'product_id',
      foreignField: 'id',
      as: 'product',
    },
  });
  pipeline.push({ $unwind: '$product' });

  if (opts.q?.trim()) {
    pipeline.push({
      $match: {
        'product.name': { $regex: opts.q.trim(), $options: 'i' },
      },
    });
  }

  pipeline.push({
    $lookup: {
      from: 'categories',
      localField: 'product.category_id',
      foreignField: 'id',
      as: 'category',
    },
  });
  pipeline.push({ $unwind: '$category' });

  if (opts.limit) {
    pipeline.push({ $limit: opts.limit });
  }

  const results = await db.collection('product_variants').aggregate(pipeline).toArray();

  const uomMap: Record<string, string> = {
    ML: 'ml',
    LITRE: 'l',
    GRAM: 'g',
    KG: 'kg',
    PIECE: 'piece',
  };

  const rows: ItemCurrentRow[] = [];
  for (const doc of results) {
    const catName = String(doc.category?.name || '').toLowerCase();
    let category = 'grocery';
    if (catName.includes('alcohol') || catName.includes('beer') || catName.includes('rum') || catName.includes('whisky')) {
      category = 'alcohol';
    } else if (catName.includes('cold') || catName.includes('drink')) {
      category = 'soft_drink';
    } else if (catName.includes('cigar')) {
      category = 'cigar';
    } else if (catName.includes('ration')) {
      category = 'ration';
    }

    if (opts.category && category !== opts.category) continue;

    const packKind = ['ML', 'LITRE'].includes(String(doc.unit_type)) ? 'volume' : 'count';
    let volumeMl: number | null = null;
    if (doc.unit_type === 'ML') {
      volumeMl = Number(doc.unit_value);
    } else if (doc.unit_type === 'LITRE') {
      volumeMl = Number(doc.unit_value) * 1000;
    }
    const unitCount = doc.unit_type === 'PIECE' ? Number(doc.unit_value) : null;
    const packLabel = `${doc.unit_value || 1} ${doc.unit_type || ''} ${doc.package_type || ''}`.trim();

    rows.push({
      id: String(doc.id || doc._id),
      variant_id: String(doc.id || doc._id),
      product_id: String(doc.product?.id || doc.product_id),
      name: String(doc.product?.name || ''),
      category,
      category_name: String(doc.category?.name || ''),
      uom: (doc.unit_type && uomMap[doc.unit_type]) || doc.uom || 'piece',
      unit_value: doc.unit_value ? Number(doc.unit_value) : undefined,
      unit_type: doc.unit_type,
      package_type: doc.package_type,
      pack_label: packLabel,
      pack_kind: packKind as 'volume' | 'count',
      volume_ml: volumeMl,
      unit_count: unitCount,
      is_active: doc.is_active ?? true,
    });
  }

  return rows;
}
