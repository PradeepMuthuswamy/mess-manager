'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireCapability } from '@/lib/auth/require-capability';
import {
  createScaleSchema,
  updateScaleSchema,
  upsertScaleItemSchema,
  bulkUpdateScaleItemsSchema,
} from '@/lib/schemas/ration';
import { bulkImportScaleRowSchema, type BulkImportScaleRow } from './bulk-import';
import type { Database } from '@/lib/supabase/database.types';
import type { RationScaleItemVersionRow } from './types';

type RationScaleUpdate = Database['public']['Tables']['ration_scales']['Update'];

export type BulkImportScaleResult = {
  total: number;
  inserted: number;
  failed: number;
  errors: Array<{ rowNumber: number; name: string; message: string }>;
};

function revalidateRation(scaleId?: string) {
  revalidatePath('/ration');
  if (scaleId) revalidatePath(`/ration/scales/${scaleId}`);
}

export async function createScaleAction(_prev: unknown, formData: FormData) {
  const parsed = createScaleSchema.safeParse({
    unit_id: formData.get('unit_id'),
    name: formData.get('name'),
    rank_class: formData.get('rank_class'),
    terrain: formData.get('terrain'),
    description: formData.get('description') || undefined,
  });
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  await requireCapability('ration.adjust', parsed.data.unit_id);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ration_scales')
    .insert({
      unit_id: parsed.data.unit_id,
      name: parsed.data.name,
      rank_class: parsed.data.rank_class,
      terrain: parsed.data.terrain,
      description: parsed.data.description ?? null,
    })
    .select('id')
    .single();
  if (error || !data) return { error: error?.message ?? 'Could not create scale' };

  revalidateRation();
  return { ok: true, id: data.id };
}

export type BulkUpdateScaleResult = {
  attempted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ item_id: string; message: string }>;
};

export async function bulkUpdateScaleItemsAction(input: {
  scale_id: string;
  item_ids: string[];
  operation: 'set' | 'multiply' | 'add_percent';
  value: number;
  notes?: string;
}): Promise<{ ok?: boolean; result?: BulkUpdateScaleResult; error?: string }> {
  const parsed = bulkUpdateScaleItemsSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid input' };

  const supabase = await createClient();
  const { data: scale } = await supabase
    .from('ration_scales')
    .select('id, unit_id')
    .eq('id', parsed.data.scale_id)
    .maybeSingle();
  if (!scale) return { error: 'Scale not found' };

  await requireCapability('ration.adjust', scale.unit_id);

  const { data: current, error: curErr } = await supabase
    .from('ration_scale_item_versions')
    .select('item_id, auth_qty, uom')
    .eq('scale_id', parsed.data.scale_id)
    .is('valid_to', null)
    .in('item_id', parsed.data.item_ids);
  if (curErr) return { error: curErr.message };

  const result: BulkUpdateScaleResult = {
    attempted: parsed.data.item_ids.length,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const effective = new Date().toISOString();

  for (const itemId of parsed.data.item_ids) {
    const row = (current ?? []).find((r) => r.item_id === itemId);
    if (!row) {
      result.skipped++;
      result.errors.push({ item_id: itemId, message: 'No open authorisation' });
      continue;
    }
    const old = Number(row.auth_qty ?? 0);
    let next = old;
    switch (parsed.data.operation) {
      case 'set':
        next = parsed.data.value;
        break;
      case 'multiply':
        next = old * parsed.data.value;
        break;
      case 'add_percent':
        next = old * (1 + parsed.data.value / 100);
        break;
    }
    if (!Number.isFinite(next) || next < 0) {
      result.failed++;
      result.errors.push({ item_id: itemId, message: 'Computed qty out of range' });
      continue;
    }
    next = Math.round(next * 10000) / 10000;

    const { error: rpcErr } = await supabase.rpc('set_ration_scale_item', {
      p_scale_id: parsed.data.scale_id,
      p_item_id: itemId,
      p_auth_qty: next,
      p_uom: row.uom,
      ...(parsed.data.notes ? { p_notes: parsed.data.notes } : {}),
      p_effective_at: effective,
    });
    if (rpcErr) {
      result.failed++;
      result.errors.push({ item_id: itemId, message: rpcErr.message });
      continue;
    }
    result.updated++;
  }

  revalidateRation(parsed.data.scale_id);
  return { ok: true, result };
}

export async function updateScaleAction(_prev: unknown, formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Missing id' };

  const parsed = updateScaleSchema.safeParse({
    name: formData.get('name') || undefined,
    description: formData.get('description') || undefined,
    is_active:
      formData.get('is_active') == null ? undefined : formData.get('is_active') === 'true',
  });
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('ration_scales')
    .select('unit_id')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return { error: 'Scale not found' };

  await requireCapability('ration.adjust', existing.unit_id);

  const patch: RationScaleUpdate = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description ?? null;
  if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active;

  const { error } = await supabase.from('ration_scales').update(patch).eq('id', id);
  if (error) return { error: error.message };

  revalidateRation(id);
  return { ok: true };
}

export async function deleteScaleAction(_prev: unknown, formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Missing id' };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('ration_scales')
    .select('unit_id')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return { error: 'Scale not found' };

  await requireCapability('ration.adjust', existing.unit_id);

  const { error } = await supabase
    .from('ration_scales')
    .update({ is_active: false })
    .eq('id', id);
  if (error) return { error: error.message };

  revalidateRation(id);
  return { ok: true };
}

export async function upsertScaleItemAction(_prev: unknown, formData: FormData) {
  const scaleId = String(formData.get('scale_id') ?? '');
  if (!scaleId) return { error: 'Missing scale_id' };

  const parsed = upsertScaleItemSchema.safeParse({
    item_id: formData.get('item_id'),
    auth_qty: formData.get('auth_qty'),
    uom: formData.get('uom'),
    notes: formData.get('notes') || undefined,
    effective_at: formData.get('effective_at') || undefined,
  });
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  const supabase = await createClient();
  const { data: scale } = await supabase
    .from('ration_scales')
    .select('unit_id')
    .eq('id', scaleId)
    .maybeSingle();
  if (!scale) return { error: 'Scale not found' };

  await requireCapability('ration.adjust', scale.unit_id);

  const { data, error } = await supabase.rpc('set_ration_scale_item', {
    p_scale_id: scaleId,
    p_item_id: parsed.data.item_id,
    p_auth_qty: parsed.data.auth_qty,
    p_uom: parsed.data.uom,
    ...(parsed.data.notes != null ? { p_notes: parsed.data.notes } : {}),
    p_effective_at: parsed.data.effective_at
      ? new Date(parsed.data.effective_at).toISOString()
      : new Date().toISOString(),
  });
  if (error) return { error: error.message };

  revalidateRation(scaleId);
  return { ok: true, version_id: data };
}

export async function removeScaleItemAction(_prev: unknown, formData: FormData) {
  const scaleId = String(formData.get('scale_id') ?? '');
  const itemId = String(formData.get('item_id') ?? '');
  if (!scaleId || !itemId) return { error: 'Missing scale_id or item_id' };

  const supabase = await createClient();
  const { data: scale } = await supabase
    .from('ration_scales')
    .select('unit_id')
    .eq('id', scaleId)
    .maybeSingle();
  if (!scale) return { error: 'Scale not found' };

  await requireCapability('ration.adjust', scale.unit_id);

  // Close the currently-open version (valid_to is null) for this (scale, item).
  const { error } = await supabase
    .from('ration_scale_item_versions')
    .update({ valid_to: new Date().toISOString() })
    .eq('scale_id', scaleId)
    .eq('item_id', itemId)
    .is('valid_to', null);
  if (error) return { error: error.message };

  revalidateRation(scaleId);
  return { ok: true };
}

export async function bulkImportScaleItemsAction(input: {
  scale_id: string;
  rows: Array<Record<string, unknown>>;
}): Promise<{ ok?: boolean; result?: BulkImportScaleResult; error?: string }> {
  if (!input.scale_id) return { error: 'Missing scale_id' };

  const supabase = await createClient();
  const { data: scale } = await supabase
    .from('ration_scales')
    .select('id, unit_id')
    .eq('id', input.scale_id)
    .maybeSingle();
  if (!scale) return { error: 'Scale not found' };

  await requireCapability('ration.adjust', scale.unit_id);

  const result: BulkImportScaleResult = {
    total: input.rows.length,
    inserted: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < input.rows.length; i++) {
    const rowNumber = i + 1;
    const parsed = bulkImportScaleRowSchema.safeParse(input.rows[i]);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      result.failed++;
      result.errors.push({
        rowNumber,
        name: String((input.rows[i] as { item_name?: string })?.item_name ?? ''),
        message: `${first.path.join('.')}: ${first.message}`,
      });
      continue;
    }
    const row: BulkImportScaleRow = parsed.data;

    // Resolve item_id by name within unit (or global), restricted to ration/grocery.
    const { data: matches, error: lookupErr } = await supabase
      .from('items')
      .select('id, name')
      .ilike('name', row.item_name)
      .in('category', ['ration', 'grocery'])
      .eq('is_active', true)
      .or(`unit_id.is.null,unit_id.eq.${scale.unit_id}`)
      .limit(2);
    if (lookupErr) {
      result.failed++;
      result.errors.push({ rowNumber, name: row.item_name, message: lookupErr.message });
      continue;
    }
    if (!matches || matches.length === 0) {
      result.failed++;
      result.errors.push({
        rowNumber,
        name: row.item_name,
        message: 'No matching ration/grocery item found in this unit',
      });
      continue;
    }
    if (matches.length > 1) {
      result.failed++;
      result.errors.push({
        rowNumber,
        name: row.item_name,
        message: 'Multiple items match this name — please disambiguate first',
      });
      continue;
    }

    const { error: rpcErr } = await supabase.rpc('set_ration_scale_item', {
      p_scale_id: input.scale_id,
      p_item_id: matches[0].id,
      p_auth_qty: row.auth_qty,
      p_uom: row.uom,
      ...(row.notes != null ? { p_notes: row.notes } : {}),
      p_effective_at: new Date().toISOString(),
    });
    if (rpcErr) {
      result.failed++;
      result.errors.push({ rowNumber, name: row.item_name, message: rpcErr.message });
      continue;
    }
    result.inserted++;
  }

  revalidateRation(input.scale_id);
  return { ok: true, result };
}

// Read-only helper exposed as a server action so client components can fetch
// version history on demand without round-tripping a full page refresh. Still
// gated by `ration.read` against the scale's unit.
export async function getScaleItemHistoryAction(
  scaleId: string,
  itemId: string,
): Promise<{ ok?: boolean; rows?: RationScaleItemVersionRow[]; error?: string }> {
  if (!scaleId || !itemId) return { error: 'Missing scale_id or item_id' };

  const supabase = await createClient();
  const { data: scale } = await supabase
    .from('ration_scales')
    .select('unit_id')
    .eq('id', scaleId)
    .maybeSingle();
  if (!scale) return { error: 'Scale not found' };

  await requireCapability('ration.read', scale.unit_id);

  const { data, error } = await supabase
    .from('ration_scale_item_versions')
    .select(
      'id, scale_id, item_id, auth_qty, uom, notes, valid_from, valid_to, created_at, created_by',
    )
    .eq('scale_id', scaleId)
    .eq('item_id', itemId)
    .order('valid_from', { ascending: false });
  if (error) return { error: error.message };

  return { ok: true, rows: (data ?? []) as RationScaleItemVersionRow[] };
}
