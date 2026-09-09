import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getAttendanceDay } from '@/lib/attendance/queries';
import type { MessType } from '@/lib/schemas/attendance';
import { rankClassForMessType } from './mess-type';
import type {
  RationScaleRow,
  RationScaleItemVersionRow,
  RationScaleItemCurrentRow,
  RationScaleListItem,
  AuthorisationMatrixRow,
  RationClass,
  RationTerrain,
  EligibleItem,
  ListScalesOpts,
  DailyRationConsumptionItem,
  DailyRationConsumptionResult,
  RationStockReportRow,
  RationStockTransactionListItem,
  RationMonthlyNetReportRow,
} from './types';

export type {
  EligibleItem,
  ListScalesOpts,
  DailyRationConsumptionItem,
  DailyRationConsumptionResult,
  RationStockReportRow,
  RationStockTransactionListItem,
  RationMonthlyNetReportRow,
};

const SCALE_COLS =
  'id, unit_id, name, description, is_active, rank_class, terrain, created_at, updated_at, created_by, updated_by';

function roundQty(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function calendarMonthRange(year: number, month: number): { from: string; to: string } {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${pad2(month)}-01`,
    to: `${year}-${pad2(month)}-${pad2(lastDay)}`,
  };
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
      // Unknown types are ignored so they cannot inflate receipts.
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
  const supabase = await createClient();
  let q = supabase
    .from('ration_scales')
    .select(SCALE_COLS)
    .eq('unit_id', opts.unitId)
    .order('rank_class')
    .order('terrain')
    .order('name');

  if (!opts.includeInactive) q = q.eq('is_active', true);
  if (opts.q) q = q.ilike('name', `%${opts.q}%`);
  if (opts.rankClass) q = q.eq('rank_class', opts.rankClass);
  if (opts.terrain) q = q.eq('terrain', opts.terrain);

  const { data: scales, error } = await q;
  if (error) throw new Error(error.message);
  if (!scales || scales.length === 0) return [];

  // Counts: pull current-item view filtered to this unit, group in JS.
  // One round-trip rather than N+1.
  const { data: currentItems, error: cErr } = await supabase
    .from('v_ration_scale_items_current')
    .select('scale_id')
    .eq('unit_id', opts.unitId);
  if (cErr) throw new Error(cErr.message);

  const counts = new Map<string, number>();
  for (const row of currentItems ?? []) {
    if (!row.scale_id) continue;
    counts.set(row.scale_id, (counts.get(row.scale_id) ?? 0) + 1);
  }

  return scales.map((s) => ({
    ...s,
    item_count: counts.get(s.id) ?? 0,
  }));
}

export async function getScale(id: string): Promise<RationScaleRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ration_scales')
    .select(SCALE_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function getScaleByDimensions(
  unitId: string,
  rankClass: RationClass,
  terrain: RationTerrain,
): Promise<RationScaleRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ration_scales')
    .select(SCALE_COLS)
    .eq('unit_id', unitId)
    .eq('rank_class', rankClass)
    .eq('terrain', terrain)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function listScaleItemsCurrent(scaleId: string): Promise<RationScaleItemCurrentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_ration_scale_items_current')
    .select('*')
    .eq('scale_id', scaleId)
    .order('item_name');
  if (error) throw new Error(error.message);
  return (data ?? []) as RationScaleItemCurrentRow[];
}

export async function listScaleItemVersions(
  scaleId: string,
  itemId: string,
): Promise<RationScaleItemVersionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ration_scale_item_versions')
    .select('id, scale_id, variant_id, auth_qty, uom, notes, valid_from, valid_to, created_at, created_by')
    .eq('scale_id', scaleId)
    .eq('variant_id', itemId)
    .order('valid_from', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as RationScaleItemVersionRow[];
}

export async function getAuthorisationMatrix(
  unitId: string,
  opts?: { terrain?: RationTerrain },
): Promise<{ scales: RationScaleListItem[]; rows: AuthorisationMatrixRow[] }> {
  const scales = await listScales({
    unitId,
    includeInactive: false,
    terrain: opts?.terrain,
  });
  if (scales.length === 0) return { scales: [], rows: [] };

  const supabase = await createClient();
  let q = supabase
    .from('v_ration_scale_items_current')
    .select('scale_id, item_id, item_name, category, auth_qty, uom, notes')
    .eq('unit_id', unitId);
  if (opts?.terrain) q = q.eq('terrain', opts.terrain);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const byItem = new Map<string, AuthorisationMatrixRow>();
  for (const row of data ?? []) {
    if (!row.item_id || !row.scale_id) continue;
    let r = byItem.get(row.item_id);
    if (!r) {
      r = {
        item_id: row.item_id,
        item_name: row.item_name ?? '',
        category: (row.category as string | null) ?? '',
        byScale: {},
      };
      byItem.set(row.item_id, r);
    }
    r.byScale[row.scale_id] = {
      auth_qty: Number(row.auth_qty ?? 0),
      uom: (row.uom as string | null) ?? '',
      notes: row.notes ?? null,
    };
  }

  const rows = Array.from(byItem.values()).sort((a, b) =>
    a.item_name.localeCompare(b.item_name),
  );
  return { scales, rows };
}

// Items the user can attach to a scale. Limited to ration + grocery so the
// list stays meaningful (rice, atta, sugar, tea, onion, etc.). Scoped to
// the unit OR global items.
export async function listEligibleItems(unitId: string, q?: string): Promise<EligibleItem[]> {
  const supabase = await createClient();
  let qb = supabase
    .from('v_items_current')
    .select('id, name, category, uom')
    .in('category', ['ration', 'grocery'])
    .eq('is_active', true)
    .or(`unit_id.is.null,unit_id.eq.${unitId}`)
    .order('name')
    .limit(200);
  if (q) qb = qb.ilike('name', `%${q}%`);
  const { data, error } = await qb;
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((r) => r.id && r.name)
    .map((r) => ({
      id: r.id!,
      name: r.name!,
      category: r.category as string,
      uom: r.uom as string,
    }));
}

export async function getDailyRationConsumption(
  unitId: string,
  date: string,
): Promise<DailyRationConsumptionResult> {
  const supabase = await createClient();

  // 1. Get attendance strength
  let presentCount = 0;
  let attendanceStatus: DailyRationConsumptionResult['attendanceStatus'] = 'none';
  try {
    const att = await getAttendanceDay(unitId, date, supabase);
    presentCount = att.present_count;
    attendanceStatus = att.status === 'finalized' ? 'finalized' : 'draft';
  } catch {
    // Default to 0 and 'none' if no attendance recorded
  }

  // 2. Get active scale for the unit
  const { data: unitRow } = await supabase
    .from('units')
    .select('mess_type, terrain')
    .eq('id', unitId)
    .maybeSingle();

  const messType = (unitRow?.mess_type as MessType | null) ?? null;
  const terrain = (unitRow?.terrain as RationTerrain | null) ?? 'plains';
  const rankClass = rankClassForMessType(messType) ?? 'officer';

  const scale = await getScaleByDimensions(unitId, rankClass, terrain);
  if (!scale) {
    return { attendanceStatus, presentCount, items: [] };
  }

  // 3. List current scale items
  const scaleItems = await listScaleItemsCurrent(scale.id);

  // 4. Fetch existing daily consumption records for this date
  const { data: consumptions } = await supabase
    .from('ration_consumptions')
    .select('id, variant_id, quantity')
    .eq('unit_id', unitId)
    .eq('consumption_date', date);

  const consMap = new Map<string, { id: string; variant_id: string; quantity: number }>();
  for (const c of consumptions ?? []) {
    consMap.set(c.variant_id, {
      id: c.id,
      variant_id: c.variant_id,
      quantity: Number(c.quantity),
    });
  }

  const items: DailyRationConsumptionItem[] = scaleItems
    .filter((si): si is typeof si & { item_id: string } => si.item_id !== null)
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
  const supabase = await createClient();

  const eligibleItems = await listEligibleItems(unitId);

  const { data: txs, error } = await supabase
    .from('ration_stock_transactions')
    .select('variant_id, type, quantity, rate, transaction_date, created_at')
    .eq('unit_id', unitId);
  if (error) throw new Error(error.message);

  const txMap = new Map<string, LedgerAgg>();
  for (const tx of txs ?? []) {
    const cur = txMap.get(tx.variant_id) ?? emptyAgg();
    applyLedgerTx(cur, tx);
    txMap.set(tx.variant_id, cur);
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

export async function getRationMonthlyNetReport(
  unitId: string,
  year: number,
  month: number,
): Promise<RationMonthlyNetReportRow[]> {
  const { from, to } = calendarMonthRange(year, month);
  const supabase = await createClient();
  const eligibleItems = await listEligibleItems(unitId);

  const { data: txs, error } = await supabase
    .from('ration_stock_transactions')
    .select('variant_id, type, quantity, rate, transaction_date, created_at')
    .eq('unit_id', unitId)
    .lte('transaction_date', to);
  if (error) throw new Error(error.message);

  const openingMap = new Map<string, LedgerAgg>();
  const periodMap = new Map<string, LedgerAgg>();

  for (const tx of txs ?? []) {
    if (tx.transaction_date < from) {
      const opening = openingMap.get(tx.variant_id) ?? emptyAgg();
      applyLedgerTx(opening, tx);
      openingMap.set(tx.variant_id, opening);
      continue;
    }
    const period = periodMap.get(tx.variant_id) ?? emptyAgg();
    applyLedgerTx(period, tx);
    periodMap.set(tx.variant_id, period);
  }

  return eligibleItems.map((item) => {
    const openingAgg = openingMap.get(item.id) ?? emptyAgg();
    const periodAgg = periodMap.get(item.id) ?? emptyAgg();
    const opening_qty = netQtyFromAgg(openingAgg);
    const fields = reportFieldsFromAgg(periodAgg);
    const closing_qty = roundQty(opening_qty + fields.net_qty);
    return {
      variant_id: item.id,
      item_name: item.name,
      uom: item.uom,
      opening_qty,
      total_receipts: fields.total_receipts,
      total_issued: fields.total_issued,
      total_returned: fields.total_returned,
      total_adjustments: fields.total_adjustments,
      net_qty: fields.net_qty,
      closing_qty,
    };
  });
}

type StockTxJoin = {
  id: string;
  variant_id: string;
  transaction_date: string;
  type: string;
  quantity: number;
  rate: number;
  amount: number;
  source: string | null;
  notes: string | null;
  variant:
    | { product: { name: string } | null }
    | { product: { name: string } | null }[]
    | null;
};

function itemNameFromVariant(variant: StockTxJoin['variant']): string {
  if (!variant) return 'Unknown';
  const row = Array.isArray(variant) ? variant[0] : variant;
  return row?.product?.name ?? 'Unknown';
}

export async function listRationStockTransactions(
  unitId: string,
): Promise<RationStockTransactionListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ration_stock_transactions')
    .select(`
      id,
      variant_id,
      transaction_date,
      type,
      quantity,
      rate,
      amount,
      source,
      notes,
      variant:product_variants (
        product:products (
          name
        )
      )
    `)
    .eq('unit_id', unitId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as StockTxJoin[]).map((d) => ({
    id: d.id,
    variant_id: d.variant_id,
    transaction_date: d.transaction_date,
    type: d.type,
    quantity: Number(d.quantity),
    rate: Number(d.rate),
    amount: Number(d.amount),
    source: d.source,
    notes: d.notes,
    item_name: itemNameFromVariant(d.variant),
  }));
}
