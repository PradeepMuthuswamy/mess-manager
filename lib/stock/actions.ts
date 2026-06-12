'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireCapability } from '@/lib/auth/require-capability';
import { requireUser } from '@/lib/auth/require-role';
import {
  updateLotSchema,
  adjustQtySchema,
} from '@/lib/schemas/inventory';
import type { Database } from '@/lib/supabase/database.types';

type UnitInventoryUpdate = Database['public']['Tables']['unit_inventory']['Update'];

const INVENTORY_WRITE = 'inventory.write';

// Every route that renders a StockTable off `unit_inventory`. Grocery split
// into its own module (/grocery/stock) but the lot actions are shared, so a
// save from there must invalidate that route too — revalidating only '/stock'
// left the grocery page serving a stale RSC cache after a write.
const STOCK_ROUTES = ['/stock', '/grocery/stock'] as const;

function revalidateStock(): void {
  for (const route of STOCK_ROUTES) revalidatePath(route);
}

type ActionResult = {
  ok?: boolean;
  error?: string;
  id?: string;
  details?: unknown;
};

// Postgres `date` columns expect a 'YYYY-MM-DD' string. zod coerces
// `acquired_on` to a Date; serialize just the calendar date.
function toDateString(d: Date | null | undefined): string | null | undefined {
  if (d === undefined) return undefined;
  if (d === null) return null;
  return d.toISOString().slice(0, 10);
}

export async function updateLotAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  // Authenticated session first — never touch the DB for an anon caller.
  await requireUser();

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Missing id' };

  const supabase = await createClient();
  // Resolve the lot's unit so the capability check is scoped correctly.
  const { data: existing } = await supabase
    .from('unit_inventory')
    .select('unit_id')
    .eq('id', id)
    .single();
  if (!existing) return { error: 'Lot not found' };

  // FIRST line of defence — never rely on RLS alone.
  await requireCapability(INVENTORY_WRITE, existing.unit_id);

  const parsed = updateLotSchema.safeParse({
    pack_size_id: formData.get('pack_size_id') || undefined,
    rate: formData.get('rate') || undefined,
    acquired_on: formData.get('acquired_on') || undefined,
    source: formData.get('source') || undefined,
    is_active:
      formData.get('is_active') == null
        ? undefined
        : formData.get('is_active') === 'true',
  });
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  const patch: UnitInventoryUpdate = {};
  if (parsed.data.pack_size_id !== undefined) patch.variant_id = parsed.data.pack_size_id;
  if (parsed.data.rate !== undefined) patch.rate = parsed.data.rate;
  if (parsed.data.acquired_on !== undefined) patch.acquired_on = toDateString(parsed.data.acquired_on);
  if (parsed.data.source !== undefined) patch.source = parsed.data.source;
  if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active;

  const { error } = await supabase.from('unit_inventory').update(patch).eq('id', id);
  if (error) return { error: error.message };

  revalidateStock();
  return { ok: true };
}

export async function adjustQtyAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  // Authenticated session first — never touch the DB for an anon caller.
  await requireUser();

  const parsed = adjustQtySchema.safeParse({
    id: formData.get('id'),
    qty_packs: formData.get('qty_packs'),
  });
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('unit_inventory')
    .select('unit_id')
    .eq('id', parsed.data.id)
    .single();
  if (!existing) return { error: 'Lot not found' };

  // FIRST line of defence — never rely on RLS alone.
  await requireCapability(INVENTORY_WRITE, existing.unit_id);

  const { error } = await supabase
    .from('unit_inventory')
    .update({ qty_packs: parsed.data.qty_packs })
    .eq('id', parsed.data.id);
  if (error) return { error: error.message };

  revalidateStock();
  return { ok: true };
}

export async function deactivateLotAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  // Authenticated session first — never touch the DB for an anon caller.
  await requireUser();

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Missing id' };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('unit_inventory')
    .select('unit_id')
    .eq('id', id)
    .single();
  if (!existing) return { error: 'Lot not found' };

  // FIRST line of defence — never rely on RLS alone.
  await requireCapability(INVENTORY_WRITE, existing.unit_id);

  const { error } = await supabase
    .from('unit_inventory')
    .update({ is_active: false })
    .eq('id', id);
  if (error) return { error: error.message };

  revalidateStock();
  return { ok: true };
}

export async function deactivateLotsAction(ids: string[]): Promise<ActionResult> {
  // Authenticated session first — never touch the DB for an anon caller.
  await requireUser();

  if (!ids || ids.length === 0) {
    return { error: 'Missing ids' };
  }

  const supabase = await createClient();
  const { data: existing, error: selectError } = await supabase
    .from('unit_inventory')
    .select('unit_id')
    .in('id', ids);

  if (selectError) return { error: selectError.message };
  if (!existing || existing.length === 0) return { error: 'Lots not found' };

  const distinctUnitIds = Array.from(new Set(existing.map((e) => e.unit_id)));
  for (const unitId of distinctUnitIds) {
    await requireCapability(INVENTORY_WRITE, unitId);
  }

  const { error: updateError } = await supabase
    .from('unit_inventory')
    .update({ is_active: false })
    .in('id', ids);

  if (updateError) return { error: updateError.message };

  revalidateStock();
  return { ok: true };
}

export async function createLotsAction(
  lots: Array<{
    unit_id: string;
    variant_id: string;
    qty_packs: number;
    rate: number;
    acquired_on: string | null;
    source: string | null;
  }>,
): Promise<ActionResult> {
  await requireUser();
  if (!lots || lots.length === 0) return { error: 'No lots provided' };

  for (const lot of lots) {
    if (!lot.unit_id || !lot.variant_id || lot.qty_packs < 0 || lot.rate < 0) {
      return { error: 'Invalid input data in lot list' };
    }
  }

  const distinctUnitIds = Array.from(new Set(lots.map((l) => l.unit_id)));
  for (const unitId of distinctUnitIds) {
    await requireCapability(INVENTORY_WRITE, unitId);
  }

  const supabase = await createClient();

  // Verify that none of the variants belong to the grocery category.
  const variantIds = lots.map((l) => l.variant_id);
  const { data: variants, error: variantErr } = await supabase
    .from('v_items_current')
    .select('id, category')
    .in('id', variantIds);

  if (variantErr) return { error: variantErr.message };
  const isGrocery = variants?.some((v) => v.category === 'grocery');
  if (isGrocery) {
    return { error: 'Adding stock for grocery items is disabled' };
  }

  const { error } = await supabase
    .from('unit_inventory')
    .insert(
      lots.map((l) => ({
        unit_id: l.unit_id,
        variant_id: l.variant_id,
        qty_packs: l.qty_packs,
        rate: l.rate,
        acquired_on: l.acquired_on ? l.acquired_on.slice(0, 10) : null,
        source: l.source,
      }))
    );

  if (error) return { error: error.message };

  revalidateStock();
  return { ok: true };
}

