import 'server-only';
import { getCollection, getDb } from '@/lib/mongo';
import { getAttendanceDay } from '@/lib/attendance/queries';
import type { MessType } from '@/lib/schemas/attendance';
import { rankClassForMessType } from './mess-type';
import type {
  RationScale,
  RationScaleRow,
  RationScaleItemVersion,
  RationConsumption,
  RationStockTransaction,
  RationScaleItemCurrentRow,
  RationScaleListItem,
  RationClass,
  RationTerrain,
  EligibleItem,
  ListScalesOpts,
  DailyRationConsumptionItem,
  DailyRationConsumptionResult,
  RationStockReportRow,
  RationStockTransactionListItem,
} from './types';

type PipelineDoc = {
  id: string;
  scale_id: string;
  variant_id: string;
  auth_qty: number;
  uom: string;
  notes: string | null;
  valid_from: string;
  created_at: string;
  created_by: string | null;
  valid_to: string | null;
  scale?: {
    unit_id?: string;
    name?: string;
    rank_class?: RationClass;
    terrain?: RationTerrain;
    is_active?: boolean;
  };
  variant?: {
    sku?: string;
    unit_type?: string;
    id?: string;
  };
  product?: {
    name?: string;
  };
  category?: {
    name?: string;
    slug?: string;
  };
};

type MatchedCatDoc = {
  id: string;
  name?: string;
  slug?: string;
};

type EligibleItemDoc = {
  name: string;
  variants: {
    id: string;
    unit_type?: string;
  };
  cat?: {
    slug?: string;
    name?: string;
  };
};

type TxDoc = {
  id: string;
  variant_id: string;
  transaction_date: string;
  type: string;
  quantity: number;
  rate: number;
  amount: number;
  source: string | null;
  notes: string | null;
  product?: {
    name?: string;
  };
};


export type {
  EligibleItem,
  ListScalesOpts,
  DailyRationConsumptionItem,
  DailyRationConsumptionResult,
  RationStockReportRow,
  RationStockTransactionListItem,
};

function roundQty(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

type LedgerAgg = {
  receipts: number;
  issued: number;
  returned: number;
  adjustments: number;
  lastRate: number;
  lastRateDate: string | null;
  lastRateAt: string | null;
};

function emptyAgg(): LedgerAgg {
  return {
    receipts: 0,
    issued: 0,
    returned: 0,
    adjustments: 0,
    lastRate: 0,
    lastRateDate: null,
    lastRateAt: null,
  };
}

function applyLedgerTx(
  agg: LedgerAgg,
  tx: {
    type: string;
    quantity: number;
    rate: number | null;
    transaction_date: string;
    created_at?: string | null;
  },
) {
  const qty = Number(tx.quantity);
  switch (tx.type) {
    case 'receipt': {
      agg.receipts += qty;
      const rate = tx.rate == null ? null : Number(tx.rate);
      if (rate != null && Number.isFinite(rate)) {
        const createdAt = tx.created_at ?? '';
        const newer =
          agg.lastRateDate == null ||
          tx.transaction_date > agg.lastRateDate ||
          (tx.transaction_date === agg.lastRateDate && createdAt >= (agg.lastRateAt ?? ''));
        if (newer) {
          agg.lastRate = rate;
          agg.lastRateDate = tx.transaction_date;
          agg.lastRateAt = createdAt;
        }
      }
      break;
    }
    case 'consumption':
      agg.issued += qty;
      break;
    case 'return_to_source':
      agg.returned += qty;
      break;
    case 'adjustment':
      agg.adjustments += qty;
      break;
    default:
      break;
  }
}

function netQtyFromAgg(agg: LedgerAgg): number {
  return roundQty(agg.receipts + agg.adjustments - agg.issued - agg.returned);
}

function reportFieldsFromAgg(agg: LedgerAgg) {
  const total_receipts = roundQty(agg.receipts);
  const total_issued = roundQty(agg.issued);
  const total_returned = roundQty(agg.returned);
  const total_adjustments = roundQty(agg.adjustments);
  const net_issued = roundQty(total_issued - total_returned);
  const net_qty = netQtyFromAgg(agg);
  return {
    total_receipts,
    total_issued,
    total_returned,
    total_adjustments,
    net_issued,
    net_qty,
    current_balance: net_qty,
    last_rate: agg.lastRate,
  };
}

export async function listScales(opts: ListScalesOpts): Promise<RationScaleListItem[]> {
  const col = await getCollection<RationScale>('ration_scales');
  const filter: Record<string, unknown> = { unit_id: opts.unitId };
  if (!opts.includeInactive) filter.is_active = true;
  if (opts.q) filter.name = { $regex: opts.q, $options: 'i' };
  if (opts.rankClass) filter.rank_class = opts.rankClass;
  if (opts.terrain) filter.terrain = opts.terrain;

  const scales = await col.find(filter).sort({ rank_class: 1, terrain: 1, name: 1 }).toArray();
  if (!scales || scales.length === 0) return [];

  const scaleIds = scales.map((s: { id: string }) => s.id);
  const versionsCol = await getCollection<RationScaleItemVersion>('ration_scale_item_versions');
  const currentItems = await versionsCol
    .find({
      scale_id: { $in: scaleIds },
      $or: [{ valid_to: null }, { valid_to: { $exists: false } }],
    })
    .project({ scale_id: 1 })
    .toArray();

  const counts = new Map<string, number>();
  for (const row of currentItems) {
    if (!row.scale_id) continue;
    counts.set(String(row.scale_id), (counts.get(String(row.scale_id)) ?? 0) + 1);
  }

  return scales.map((s: RationScale) => ({
    id: s.id,
    unit_id: s.unit_id ?? null,
    name: s.name,
    description: s.description ?? null,
    is_active: s.is_active ?? true,
    rank_class: s.rank_class,
    terrain: s.terrain,
    created_at: s.created_at,
    updated_at: s.updated_at,
    created_by: s.created_by ?? null,
    updated_by: s.updated_by ?? null,
    item_count: counts.get(s.id) ?? 0,
  }));
}

export async function getScale(id: string): Promise<RationScaleRow | null> {
  const col = await getCollection<RationScale>('ration_scales');
  const scale = await col.findOne({ id });
  if (!scale) return null;
  return {
    id: scale.id,
    unit_id: scale.unit_id ?? null,
    name: scale.name,
    description: scale.description ?? null,
    is_active: scale.is_active ?? true,
    rank_class: scale.rank_class,
    terrain: scale.terrain,
    created_at: scale.created_at,
    updated_at: scale.updated_at,
    created_by: scale.created_by ?? null,
    updated_by: scale.updated_by ?? null,
  };
}

export async function getScaleByDimensions(
  unitId: string,
  rankClass: RationClass,
  terrain: RationTerrain,
): Promise<RationScaleRow | null> {
  const col = await getCollection<RationScale>('ration_scales');
  const scale = await col.findOne({
    unit_id: unitId,
    rank_class: rankClass,
    terrain: terrain,
  });
  if (!scale) return null;
  return {
    id: scale.id,
    unit_id: scale.unit_id ?? null,
    name: scale.name,
    description: scale.description ?? null,
    is_active: scale.is_active ?? true,
    rank_class: scale.rank_class,
    terrain: scale.terrain,
    created_at: scale.created_at,
    updated_at: scale.updated_at,
    created_by: scale.created_by ?? null,
    updated_by: scale.updated_by ?? null,
  };
}

export async function listScaleItemsCurrent(
  scaleId: string,
): Promise<RationScaleItemCurrentRow[]> {
  const db = await getDb();
  const pipeline: Record<string, unknown>[] = [
    {
      $match: {
        scale_id: scaleId,
        $or: [{ valid_to: null }, { valid_to: { $exists: false } }],
      },
    },
    {
      $lookup: {
        from: 'ration_scales',
        localField: 'scale_id',
        foreignField: 'id',
        as: 'scale',
      },
    },
    { $unwind: { path: '$scale', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'product_variants',
        localField: 'variant_id',
        foreignField: 'id',
        as: 'variant',
      },
    },
    { $unwind: { path: '$variant', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'products',
        localField: 'variant.product_id',
        foreignField: 'id',
        as: 'product',
      },
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'categories',
        localField: 'product.category_id',
        foreignField: 'id',
        as: 'category',
      },
    },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    { $sort: { 'product.name': 1 } },
  ];

  const rows = (await db.collection('ration_scale_item_versions').aggregate(pipeline).toArray()) as unknown as PipelineDoc[];

  return rows.map((doc: PipelineDoc) => ({
    version_id: String(doc.id),
    scale_id: String(doc.scale_id),
    variant_id: String(doc.variant_id),
    item_id: String(doc.variant_id),
    unit_id: doc.scale?.unit_id ? String(doc.scale.unit_id) : null,
    scale_name: doc.scale?.name ?? '',
    rank_class: doc.scale?.rank_class ?? 'officer',
    terrain: doc.scale?.terrain ?? 'plains',
    scale_active: doc.scale?.is_active ?? true,
    category: doc.category?.name ?? doc.category?.slug ?? 'ration',
    item_name: doc.product?.name ?? 'Unknown item',
    sku: doc.variant?.sku ?? null,
    auth_qty: Number(doc.auth_qty ?? 0),
    uom: String(doc.uom),
    notes: doc.notes ? String(doc.notes) : null,
    valid_from: String(doc.valid_from),
    created_by: doc.created_by ? String(doc.created_by) : null,
  }));
}



export async function listEligibleItems(unitId: string, q?: string): Promise<EligibleItem[]> {
  const db = await getDb();
  const categoriesCol = db.collection('categories');
  const catIds = [
    '00000000-0000-0000-0000-000000000005', // ration
    '00000000-0000-0000-0000-000000000006', // grocery
  ];
  const matchedCats = (await categoriesCol
    .find({
      $or: [
        { id: { $in: catIds } },
        { parent_id: { $in: catIds } },
        { slug: { $in: ['ration', 'grocery'] } },
        { name: { $regex: '^(ration|grocery)$', $options: 'i' } },
      ],
    })
    .project({ id: 1, name: 1, slug: 1 })
    .toArray()) as unknown as MatchedCatDoc[];

  const allowedCatIds = matchedCats.map((c: MatchedCatDoc) => String(c.id));
  const finalCatIds = allowedCatIds.length > 0 ? allowedCatIds : catIds;

  const matchFilter: Record<string, unknown> = {
    category_id: { $in: finalCatIds },
    is_active: { $ne: false },
  };
  if (q?.trim()) {
    matchFilter.name = { $regex: q.trim(), $options: 'i' };
  }

  const pipeline: Record<string, unknown>[] = [
    { $match: matchFilter },
    {
      $lookup: {
        from: 'product_variants',
        localField: 'id',
        foreignField: 'product_id',
        as: 'variants',
      },
    },
    { $unwind: '$variants' },
    { $match: { 'variants.is_active': { $ne: false } } },
    {
      $lookup: {
        from: 'categories',
        localField: 'category_id',
        foreignField: 'id',
        as: 'cat',
      },
    },
    { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
    { $sort: { name: 1 } },
    { $limit: 200 },
  ];

  const items = (await db.collection('products').aggregate(pipeline).toArray()) as unknown as EligibleItemDoc[];

  return items.map((r: EligibleItemDoc) => ({
    id: String(r.variants.id),
    name: String(r.name),
    category: String(r.cat?.slug ?? r.cat?.name ?? 'ration'),
    uom: String(r.variants.unit_type ? r.variants.unit_type.toLowerCase() : 'kg'),
  }));
}

export async function getDailyRationConsumption(
  unitId: string,
  date: string,
): Promise<DailyRationConsumptionResult> {
  let presentCount = 0;
  let attendanceStatus: DailyRationConsumptionResult['attendanceStatus'] = 'none';
  try {
    const att = await getAttendanceDay(unitId, date);
    presentCount = att.present_count;
    attendanceStatus = att.status === 'finalized' ? 'finalized' : 'draft';
  } catch {
    // Default to 0 and 'none' if no attendance recorded
  }

  const unitsCol = await getCollection('units');
  const unitRow = await unitsCol.findOne({ id: unitId });

  const messType = (unitRow?.mess_type as MessType | null) ?? null;
  const terrain = (unitRow?.terrain as RationTerrain | null) ?? 'plains';
  const rankClass = rankClassForMessType(messType) ?? 'officer';

  const scale = await getScaleByDimensions(unitId, rankClass, terrain);
  if (!scale) {
    return { attendanceStatus, presentCount, items: [] };
  }

  const scaleItems = await listScaleItemsCurrent(scale.id);

  const consCol = await getCollection<RationConsumption>('ration_consumptions');
  const consumptions = await consCol
    .find({ unit_id: unitId, consumption_date: date })
    .toArray();

  const consMap = new Map<string, { id: string; variant_id: string; quantity: number }>();
  for (const c of consumptions) {
    consMap.set(String(c.variant_id), {
      id: String(c.id),
      variant_id: String(c.variant_id),
      quantity: Number(c.quantity),
    });
  }

  const items: DailyRationConsumptionItem[] = scaleItems
    .filter((si): si is typeof si & { item_id: string } => Boolean(si.item_id))
    .map((si) => {
      const cons = consMap.get(si.item_id);
      const authQty = Number(si.auth_qty ?? 0);
      const computedQty = presentCount * authQty;

      return {
        variant_id: si.item_id,
        item_name: si.item_name ?? '',
        category: si.category ?? '',
        uom: si.uom ?? '',
        auth_qty: authQty,
        present_count: presentCount,
        computed_qty: roundQty(computedQty),
        saved_qty: cons ? Number(cons.quantity) : null,
        is_posted: cons !== undefined,
        consumption_id: cons?.id ?? null,
      };
    });

  return { attendanceStatus, presentCount, items };
}

export async function getRationStockReport(unitId: string): Promise<RationStockReportRow[]> {
  const eligibleItems = await listEligibleItems(unitId);
  const txCol = await getCollection<RationStockTransaction>('ration_stock_transactions');
  const txs = await txCol.find({ unit_id: unitId }).toArray();

  const txMap = new Map<string, LedgerAgg>();
  for (const tx of txs) {
    const variantId = String(tx.variant_id);
    const cur = txMap.get(variantId) ?? emptyAgg();
    applyLedgerTx(cur, {
      type: String(tx.type),
      quantity: Number(tx.quantity),
      rate: tx.rate == null ? null : Number(tx.rate),
      transaction_date: String(tx.transaction_date),
      created_at: tx.created_at ? String(tx.created_at) : null,
    });
    txMap.set(variantId, cur);
  }

  return eligibleItems.map((item) => {
    const agg = txMap.get(item.id) ?? emptyAgg();
    return {
      variant_id: item.id,
      item_name: item.name,
      uom: item.uom,
      ...reportFieldsFromAgg(agg),
    };
  });
}


export async function listRationStockTransactions(
  unitId: string,
): Promise<RationStockTransactionListItem[]> {
  const db = await getDb();
  const pipeline: Record<string, unknown>[] = [
    { $match: { unit_id: unitId } },
    { $sort: { transaction_date: -1, created_at: -1 } },
    {
      $lookup: {
        from: 'product_variants',
        localField: 'variant_id',
        foreignField: 'id',
        as: 'variant',
      },
    },
    { $unwind: { path: '$variant', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'products',
        localField: 'variant.product_id',
        foreignField: 'id',
        as: 'product',
      },
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
  ];

  const txs = (await db.collection('ration_stock_transactions').aggregate(pipeline).toArray()) as unknown as TxDoc[];

  return txs.map((d: TxDoc) => ({
    id: String(d.id),
    variant_id: String(d.variant_id),
    transaction_date: String(d.transaction_date),
    type: String(d.type),
    quantity: Number(d.quantity),
    rate: Number(d.rate),
    amount: Number(d.amount),
    source: d.source ? String(d.source) : null,
    notes: d.notes ? String(d.notes) : null,
    item_name: d.product?.name ? String(d.product.name) : 'Unknown',
  }));
}
