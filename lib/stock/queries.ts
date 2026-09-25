import 'server-only';
import { getDb } from '@/lib/mongo';
import { listItemsCurrent } from '@/lib/masters/queries';
import type {
  InventoryLotRow,
  ListInventoryOpts,
  MasterItemPick,
} from './types';
import type { InventoryCategory } from '@/lib/masters/categories';

const uomMap: Record<string, string> = {
  ML: 'ml',
  LITRE: 'l',
  GRAM: 'g',
  KG: 'kg',
  PIECE: 'piece',
};

export async function listInventory(
  unitId: string | null,
  opts: ListInventoryOpts = {},
): Promise<{ rows: InventoryLotRow[]; totalCount: number }> {
  if (unitId === null) return { rows: [], totalCount: 0 };

  const db = await getDb();
  const invCol = db.collection('unit_inventory');

  const matchStage: Record<string, unknown> = { unit_id: unitId };
  if (!opts.includeInactive) matchStage.is_active = { $ne: false };
  if (opts.itemId) matchStage.variant_id = opts.itemId;

  const pipeline: Record<string, unknown>[] = [
    { $match: matchStage },
    {
      $lookup: {
        from: 'product_variants',
        localField: 'variant_id',
        foreignField: 'id',
        as: 'variant',
      },
    },
    { $unwind: '$variant' },
    {
      $lookup: {
        from: 'products',
        localField: 'variant.product_id',
        foreignField: 'id',
        as: 'product',
      },
    },
    { $unwind: '$product' },
    {
      $lookup: {
        from: 'categories',
        localField: 'product.category_id',
        foreignField: 'id',
        as: 'category',
      },
    },
    { $unwind: '$category' },
  ];

  if (opts.q) {
    const qClean = opts.q.trim();
    if (qClean) {
      pipeline.push({
        $match: {
          'product.name': { $regex: qClean, $options: 'i' },
        },
      });
    }
  }

  const sortOrder = opts.sortOrder === 'desc' ? -1 : 1;
  const sortStage: Record<string, unknown> = {};
  if (opts.sortBy === 'qty') sortStage.qty_packs = sortOrder;
  else if (opts.sortBy === 'rate') sortStage.rate = sortOrder;
  else if (opts.sortBy === 'acquired') sortStage.acquired_on = sortOrder;
  else if (opts.sortBy === 'source') sortStage.source = sortOrder;
  else sortStage['product.name'] = sortOrder;

  if (opts.sortBy !== 'name') {
    sortStage['product.name'] = 1;
  }

  pipeline.push({
    $facet: {
      total: [{ $count: 'count' }],
      rows: [
        { $sort: sortStage },
        ...(opts.page && opts.pageSize
          ? [
              { $skip: (opts.page - 1) * opts.pageSize },
              { $limit: opts.pageSize },
            ]
          : []),
      ],
    },
  });

  const results = await invCol.aggregate(pipeline).toArray();
  const facetResult = results[0] || { total: [], rows: [] };
  const totalCount = facetResult.total[0]?.count ?? 0;

  const rows: InventoryLotRow[] = [];
  for (const doc of facetResult.rows ?? []) {
    const catName = (doc.category.name || '').toLowerCase();
    let category: InventoryCategory = 'grocery';
    if (catName.includes('alcohol') || catName.includes('beer') || catName.includes('rum') || catName.includes('whisky')) {
      category = 'alcohol';
    } else if (catName.includes('cold') || catName.includes('drink')) {
      category = 'soft_drink';
    } else if (catName.includes('cigar')) {
      category = 'cigar';
    } else if (catName.includes('ration')) {
      continue;
    }

    if (opts.category && category !== opts.category) continue;

    const packKind = ['ML', 'LITRE'].includes(doc.variant.unit_type) ? 'volume' : 'count';
    let volumeMl: number | null = null;
    if (doc.variant.unit_type === 'ML') volumeMl = Number(doc.variant.unit_value);
    else if (doc.variant.unit_type === 'LITRE') volumeMl = Number(doc.variant.unit_value) * 1000;
    const unitCount = doc.variant.unit_type === 'PIECE' ? Number(doc.variant.unit_value) : null;

    rows.push({
      id: doc.id,
      unit_id: doc.unit_id,
      item_id: doc.variant_id,
      item_name: doc.product.name,
      category,
      pack_size_id: null,
      pack_label: `${doc.variant.unit_value} ${doc.variant.unit_type} ${doc.variant.package_type}`,
      kind: packKind as 'volume' | 'count',
      volume_ml: volumeMl,
      unit_count: unitCount,
      qty_packs: Number(doc.qty_packs ?? 0),
      rate: Number(doc.rate ?? 0),
      acquired_on: doc.acquired_on || '',
      source: doc.source ?? null,
      uom: (doc.variant?.unit_type && uomMap[doc.variant.unit_type]) || doc.variant?.uom || 'piece',
      is_active: Boolean(doc.is_active !== false),
      created_at: doc.created_at || '',
      created_by: doc.created_by ?? null,
      updated_at: doc.updated_at || '',
      updated_by: doc.updated_by ?? null,
    });
  }

  return { rows, totalCount };
}

export async function listMasterItemsForPicker(
  _unitId: string | null,
  q?: string,
  category?: InventoryCategory,
): Promise<MasterItemPick[]> {
  const items = await listItemsCurrent({
    category,
    activeOnly: true,
    q,
    limit: 50,
  });

  return items
    .filter((i) => i.category !== 'ration')
    .map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category as InventoryCategory,
      uom: i.uom,
      pack_label: i.pack_label || i.uom,
      pack_kind: i.pack_kind ?? null,
      volume_ml: i.volume_ml ?? null,
      unit_count: i.unit_count ?? null,
    }));
}
