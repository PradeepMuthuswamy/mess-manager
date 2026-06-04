import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Category } from './categories';
import type {
  AuthorisationChip,
  MasterRow,
  VersionRow,
  ListMastersOpts,
} from './types';
import type { RationClass, RationTerrain } from '@/lib/schemas/ration';

export type { AuthorisationChip, MasterRow, VersionRow, ListMastersOpts } from './types';

export async function listMasterItems(category: Category, opts: ListMastersOpts): Promise<MasterRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from('v_items_current')
    .select('id, unit_id, category, name, sku, uom, is_active, current_rate, current_ration_scale, rate_valid_from, version_id, updated_at')
    .eq('category', category)
    .order('name')
    .limit(opts.limit ?? 200);

  if (!opts.includeInactive) q = q.eq('is_active', true);
  if (opts.q) q = q.ilike('name', `%${opts.q}%`);
  if (!opts.isAllUnits && opts.activeUnitId) {
    q = q.or(`unit_id.is.null,unit_id.eq.${opts.activeUnitId}`);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as MasterRow[];
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

export async function listItemVersions(itemId: string): Promise<VersionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('item_versions')
    .select('id, rate, ration_scale, notes, valid_from, valid_to, created_by')
    .eq('item_id', itemId)
    .order('valid_from', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as VersionRow[];
}
