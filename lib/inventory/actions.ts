'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireCapability } from '@/lib/auth/require-capability';
import { requireUser } from '@/lib/auth/require-role';
import {
  createLotSchema,
  updateLotSchema,
  adjustQtySchema,
  createPackSizeSchema,
} from '@/lib/schemas/inventory';
import type { Database } from '@/lib/supabase/database.types';

type UnitInventoryUpdate = Database['public']['Tables']['unit_inventory']['Update'];

const INVENTORY_WRITE = 'inventory.write';
const MASTERS_WRITE = 'masters.write';

const ACTION_RESULT = '/inventory';

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

export async function createLotAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createLotSchema.safeParse({
    unit_id: formData.get('unit_id'),
    item_id: formData.get('item_id'),
    pack_size_id: formData.get('pack_size_id'),
    qty_packs: formData.get('qty_packs'),
    rate: formData.get('rate'),
    acquired_on: formData.get('acquired_on') || undefined,
    source: formData.get('source') || undefined,
  });
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  // FIRST line of defence — never rely on RLS alone.
  await requireCapability(INVENTORY_WRITE, parsed.data.unit_id);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('unit_inventory')
    .insert({
      unit_id: parsed.data.unit_id,
      item_id: parsed.data.item_id,
      pack_size_id: parsed.data.pack_size_id,
      qty_packs: parsed.data.qty_packs,
      rate: parsed.data.rate,
      acquired_on: toDateString(parsed.data.acquired_on) ?? null,
      source: parsed.data.source ?? null,
    })
    .select('id')
    .single();
  if (error || !data) return { error: error?.message ?? 'Could not create lot' };

  revalidatePath(ACTION_RESULT);
  return { ok: true, id: data.id };
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
  if (parsed.data.pack_size_id !== undefined) patch.pack_size_id = parsed.data.pack_size_id;
  if (parsed.data.rate !== undefined) patch.rate = parsed.data.rate;
  if (parsed.data.acquired_on !== undefined) patch.acquired_on = toDateString(parsed.data.acquired_on);
  if (parsed.data.source !== undefined) patch.source = parsed.data.source;
  if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active;

  const { error } = await supabase.from('unit_inventory').update(patch).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath(ACTION_RESULT);
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

  revalidatePath(ACTION_RESULT);
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

  revalidatePath(ACTION_RESULT);
  return { ok: true };
}

export async function createPackSizeAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createPackSizeSchema.safeParse({
    label: formData.get('label'),
    kind: formData.get('kind'),
    volume_ml: formData.get('volume_ml') || undefined,
    unit_count: formData.get('unit_count') || undefined,
    sort_order: formData.get('sort_order') || undefined,
  });
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  // Pack sizes are global reference/master data — gate on masters.write
  // (global scope). FIRST line of defence — never rely on RLS alone.
  await requireCapability(MASTERS_WRITE, null);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('pack_sizes')
    .insert({
      label: parsed.data.label,
      kind: parsed.data.kind,
      volume_ml: parsed.data.volume_ml ?? null,
      unit_count: parsed.data.unit_count ?? null,
      sort_order: parsed.data.sort_order,
    })
    .select('id')
    .single();
  if (error || !data) return { error: error?.message ?? 'Could not create pack size' };

  revalidatePath(ACTION_RESULT);
  return { ok: true, id: data.id };
}
