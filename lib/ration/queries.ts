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
    .select('id, scale_id, item_id, auth_qty, uom, notes, valid_from, valid_to, created_at, created_by')
    .eq('scale_id', scaleId)
    .eq('item_id', itemId)
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
    .from('items')
    .select('id, name, category, uom')
    .in('category', ['ration', 'grocery'])
    .eq('is_active', true)
    .or(`unit_id.is.null,unit_id.eq.${unitId}`)
    .order('name')
    .limit(200);
  if (q) qb = qb.ilike('name', `%${q}%`);
  const { data, error } = await qb;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category as string,
    uom: r.uom as string,
  }));
}
