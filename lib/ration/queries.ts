import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type {
  RationScaleRow,
  RationScaleItemVersionRow,
  RationScaleItemCurrentRow,
  RationScaleListItem,
  AuthorisationMatrixRow,
  RationClass,
  RationTerrain,
} from './types';

export type ListScalesOpts = {
  unitId: string;
  q?: string;
  includeInactive?: boolean;
  rankClass?: RationClass;
  terrain?: RationTerrain;
};

const SCALE_COLS =
  'id, unit_id, name, description, is_active, rank_class, terrain, created_at, updated_at, created_by, updated_by';

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

export type { EligibleItem } from './types';
import type { EligibleItem } from './types';

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

export type DailyRationConsumptionItem = {
  variant_id: string;
  item_name: string;
  category: string;
  uom: string;
  auth_qty: number;
  present_count: number;
  computed_qty: number;
  saved_qty: number | null;
  is_posted: boolean;
  consumption_id: string | null;
};

export async function getDailyRationConsumption(
  unitId: string,
  date: string,
): Promise<{
  attendanceStatus: 'draft' | 'finalized' | 'none';
  presentCount: number;
  items: DailyRationConsumptionItem[];
}> {
  const supabase = await createClient();
  
  // 1. Get attendance strength
  let presentCount = 0;
  let attendanceStatus: 'draft' | 'finalized' | 'none' = 'none';
  try {
    const att = await getAttendanceDay(unitId, date, supabase);
    presentCount = att.present_count;
    attendanceStatus = att.status;
  } catch (e) {
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

  const items = scaleItems
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
        computed_qty: Math.round(computedQty * 10000) / 10000,
        saved_qty: cons ? Number(cons.quantity) : null,
        is_posted: cons !== undefined,
        consumption_id: cons?.id ?? null,
      };
    });

  return { attendanceStatus, presentCount, items };
}

export type RationStockReportRow = {
  variant_id: string;
  item_name: string;
  uom: string;
  total_receipts: number;
  total_issued: number;
  total_returned: number;
  net_issued: number;
  current_balance: number;
  last_rate: number;
};

export async function getRationStockReport(unitId: string): Promise<RationStockReportRow[]> {
  const supabase = await createClient();

  const eligibleItems = await listEligibleItems(unitId);

  const { data: txs } = await supabase
    .from('ration_stock_transactions')
    .select('variant_id, quantity, rate')
    .eq('unit_id', unitId);

  const { data: consumptions } = await supabase
    .from('ration_consumptions')
    .select('variant_id, quantity')
    .eq('unit_id', unitId);

  const txMap = new Map<string, { total: number; lastRate: number }>();
  for (const tx of txs ?? []) {
    const cur = txMap.get(tx.variant_id) || { total: 0, lastRate: 0 };
    cur.total += Number(tx.quantity);
    if (tx.rate) cur.lastRate = Number(tx.rate);
    txMap.set(tx.variant_id, cur);
  }

  const consMap = new Map<string, number>();
  for (const c of consumptions ?? []) {
    const cur = consMap.get(c.variant_id) || 0;
    consMap.set(c.variant_id, cur + Number(c.quantity));
  }

  return eligibleItems.map((item) => {
    const tx = txMap.get(item.id) || { total: 0, lastRate: 0 };
    const totalCons = consMap.get(item.id) || 0;
    const balance = tx.total - totalCons;

    return {
      variant_id: item.id,
      item_name: item.name,
      uom: item.uom,
      total_receipts: tx.total,
      total_issued: totalCons,
      total_returned: 0,
      net_issued: totalCons,
      current_balance: balance >= 0 ? balance : 0,
      last_rate: tx.lastRate,
    };
  });
}

// Helper imports needed for daily entitlement queries
import { getAttendanceDay } from '@/lib/attendance/queries';
import { rankClassForMessType } from './mess-type';
import type { MessType } from '@/lib/schemas/attendance';

export async function listRationStockTransactions(unitId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ration_stock_transactions')
    .select(`
      id,
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
  
  return (data ?? []).map((d) => ({
    id: d.id,
    transaction_date: d.transaction_date,
    type: d.type,
    quantity: Number(d.quantity),
    rate: Number(d.rate),
    amount: Number(d.amount),
    source: d.source,
    notes: d.notes,
    item_name: (d.variant as any)?.product?.name ?? 'Unknown',
  }));
}


