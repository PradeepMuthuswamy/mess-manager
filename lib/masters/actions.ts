'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireCapability } from '@/lib/auth/require-capability';
import { requireUser } from '@/lib/auth/require-role';
import { createItemSchema, updateItemSchema, newItemVersionSchema, itemCategorySchema } from '@/lib/schemas/items';
import type { Database } from '@/lib/supabase/database.types';

type ItemUpdate = Database['public']['Tables']['items']['Update'];
import { bulkImportRowSchema, type BulkImportRow } from './bulk-import';
import type { Category } from './categories';

export type BulkImportResult = {
  total: number;
  inserted: number;
  failed: number;
  errors: Array<{ rowNumber: number; name: string; message: string }>;
};

// Masters is now a single surface at /masters (admin links redirect here),
// so there is one path to revalidate regardless of category.
function revalidateMasters() {
  revalidatePath('/masters');
}

export async function createMasterItemAction(_prev: unknown, formData: FormData) {
  const parsed = createItemSchema.safeParse({
    unit_id: formData.get('unit_id') || null,
    category: formData.get('category'),
    name: formData.get('name'),
    sku: formData.get('sku') || undefined,
    uom: formData.get('uom'),
    initial_rate: formData.get('initial_rate'),
    initial_ration_scale: formData.get('initial_ration_scale') || undefined,
    notes: formData.get('notes') || undefined,
  });
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  const cap = parsed.data.unit_id ? 'masters.write' : 'masters.write.global';
  await requireCapability(cap, parsed.data.unit_id ?? null);

  const supabase = await createClient();
  const { data: itemRow, error: insErr } = await supabase
    .from('items')
    .insert({
      unit_id: parsed.data.unit_id ?? null,
      category: parsed.data.category,
      name: parsed.data.name,
      sku: parsed.data.sku ?? null,
      uom: parsed.data.uom,
    })
    .select('id')
    .single();
  if (insErr || !itemRow) return { error: insErr?.message ?? 'Could not create item' };

  const { error: rpcErr } = await supabase.rpc('set_item_rate', {
    p_item_id: itemRow.id,
    p_rate: parsed.data.initial_rate,
    p_ration_scale: parsed.data.initial_ration_scale ?? undefined,
    p_notes: parsed.data.notes ?? undefined,
    p_effective_at: new Date().toISOString(),
  });
  if (rpcErr) return { error: rpcErr.message };

  revalidateMasters();
  return { ok: true, id: itemRow.id };
}

export async function updateMasterItemAction(_prev: unknown, formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Missing id' };
  const parsed = updateItemSchema.safeParse({
    name: formData.get('name') || undefined,
    sku: formData.get('sku') || undefined,
    uom: formData.get('uom') || undefined,
    is_active: formData.get('is_active') == null ? undefined : formData.get('is_active') === 'true',
  });
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  // Re-scope is opt-in: only present when the admin-only scope control was
  // rendered. Empty string = Global (null), a uuid = that unit.
  const scopeControl = formData.get('scope_control') === '1';
  const rawUnit = formData.get('unit_id');
  const desiredUnitId: string | null | undefined = scopeControl
    ? rawUnit
      ? String(rawUnit)
      : null
    : undefined;

  const supabase = await createClient();
  // Look up unit_id so we can check capability accurately
  const { data: existing } = await supabase.from('items').select('unit_id, category').eq('id', id).single();
  if (!existing) return { error: 'Item not found' };
  const cap = existing.unit_id ? 'masters.write' : 'masters.write.global';
  await requireCapability(cap, existing.unit_id ?? null);

  const patch: ItemUpdate = { ...parsed.data };
  if (desiredUnitId !== undefined && desiredUnitId !== existing.unit_id) {
    // Changing an item's visibility scope (unit ⇄ global) is admin-grade.
    await requireCapability('masters.write.global', null);
    patch.unit_id = desiredUnitId;
  }

  const { error } = await supabase.from('items').update(patch).eq('id', id);
  if (error) return { error: error.message };

  revalidateMasters();
  return { ok: true };
}

export async function newItemVersionAction(_prev: unknown, formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Missing id' };

  const parsed = newItemVersionSchema.safeParse({
    rate: formData.get('rate'),
    ration_scale: formData.get('ration_scale') || undefined,
    notes: formData.get('notes') || undefined,
    effective_at: formData.get('effective_at') || undefined,
  });
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  const supabase = await createClient();
  const { data: existing } = await supabase.from('items').select('unit_id, category').eq('id', id).single();
  if (!existing) return { error: 'Item not found' };
  const cap = existing.unit_id ? 'masters.write' : 'masters.write.global';
  await requireCapability(cap, existing.unit_id ?? null);

  const { error } = await supabase.rpc('set_item_rate', {
    p_item_id: id,
    p_rate: parsed.data.rate,
    p_ration_scale: parsed.data.ration_scale ?? undefined,
    p_notes: parsed.data.notes ?? undefined,
    p_effective_at: parsed.data.effective_at ? new Date(parsed.data.effective_at).toISOString() : new Date().toISOString(),
  });
  if (error) return { error: error.message };

  revalidateMasters();
  return { ok: true };
}

export async function bulkImportMasterItemsAction(input: {
  category: Category;
  unit_id: string | null; // null = global
  rows: Array<Record<string, unknown>>;
}): Promise<{ ok?: boolean; result?: BulkImportResult; error?: string }> {
  const catParse = itemCategorySchema.safeParse(input.category);
  if (!catParse.success) return { error: 'Invalid category' };
  const category = catParse.data;

  const unitId = input.unit_id ?? null;
  const cap = unitId ? 'masters.write' : 'masters.write.global';
  await requireCapability(cap, unitId);

  const supabase = await createClient();
  const result: BulkImportResult = {
    total: input.rows.length,
    inserted: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < input.rows.length; i++) {
    const rowNumber = i + 1;
    const parsed = bulkImportRowSchema.safeParse(input.rows[i]);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      result.failed++;
      result.errors.push({
        rowNumber,
        name: String((input.rows[i] as { name?: string })?.name ?? ''),
        message: `${first.path.join('.')}: ${first.message}`,
      });
      continue;
    }
    const row: BulkImportRow = parsed.data;

    const { data: itemRow, error: insErr } = await supabase
      .from('items')
      .insert({
        unit_id: unitId,
        category,
        name: row.name,
        sku: row.sku ?? null,
        uom: row.uom,
      })
      .select('id')
      .single();
    if (insErr || !itemRow) {
      result.failed++;
      result.errors.push({
        rowNumber,
        name: row.name,
        message: insErr?.message ?? 'Insert failed',
      });
      continue;
    }

    const { error: rpcErr } = await supabase.rpc('set_item_rate', {
      p_item_id: itemRow.id,
      p_rate: row.rate,
      p_ration_scale: row.ration_scale ?? undefined,
      p_notes: row.notes ?? undefined,
      p_effective_at: new Date().toISOString(),
    });
    if (rpcErr) {
      result.failed++;
      result.errors.push({
        rowNumber,
        name: row.name,
        message: rpcErr.message,
      });
      continue;
    }

    result.inserted++;
  }

  revalidateMasters();
  return { ok: true, result };
}

// ---------------------------------------------------------------------------
// Multi-edit: apply patches across many items in a single request.
// Each patch may carry property edits (name/sku/uom/is_active) AND/OR a new
// rate/ration_scale (which goes through set_item_rate so version history is
// preserved). Only fields present in a patch are touched.
// ---------------------------------------------------------------------------

export type MasterPatch = {
  id: string;
  name?: string;
  sku?: string | null;
  uom?: 'kg' | 'g' | 'l' | 'ml' | 'piece' | 'pack' | 'bottle';
  is_active?: boolean;
  rate?: number;
  ration_scale?: number | null;
  notes?: string;
};

export type BulkUpdateMastersResult = {
  attempted: number;
  updated: number;
  failed: number;
  errors: Array<{ id: string; message: string }>;
};

export async function bulkUpdateMasterItemsAction(input: {
  patches: MasterPatch[];
}): Promise<{ ok?: boolean; result?: BulkUpdateMastersResult; error?: string }> {
  // First line of defence: an authenticated session before any DB access.
  // The per-unit capability gate below is the real authorisation, but it
  // must never be skippable — see the byId.size guard.
  await requireUser();

  const patches = (input?.patches ?? []).filter((p) => p && p.id);
  if (patches.length === 0) return { error: 'No changes to save' };
  if (patches.length > 500) return { error: 'Too many patches; split into batches of 500' };

  const supabase = await createClient();

  // Look up unit_id + category for every patched item — needed for capability
  // checks and revalidation paths.
  const ids = Array.from(new Set(patches.map((p) => p.id)));
  const { data: existing, error: lookupErr } = await supabase
    .from('items')
    .select('id, unit_id, category')
    .in('id', ids);
  if (lookupErr) return { error: lookupErr.message };
  const byId = new Map<string, { unit_id: string | null; category: Category }>();
  for (const e of existing ?? []) {
    byId.set(e.id, { unit_id: e.unit_id, category: e.category as Category });
  }

  // If nothing resolved (all ids unknown or hidden by RLS), refuse rather
  // than fall through the capability loop as an ungated no-op.
  if (byId.size === 0) return { error: 'No matching items' };

  // Capability gate per distinct (unit_id) bucket. We require either the
  // unit-scoped or global write capability depending on the item's scope.
  const unitsTouched = new Set<string | null>();
  for (const p of patches) {
    const row = byId.get(p.id);
    if (row) unitsTouched.add(row.unit_id);
  }
  for (const unitId of unitsTouched) {
    const cap = unitId ? 'masters.write' : 'masters.write.global';
    await requireCapability(cap, unitId ?? null);
  }

  const result: BulkUpdateMastersResult = {
    attempted: patches.length,
    updated: 0,
    failed: 0,
    errors: [],
  };
  for (const patch of patches) {
    const row = byId.get(patch.id);
    if (!row) {
      result.failed++;
      result.errors.push({ id: patch.id, message: 'Item not found' });
      continue;
    }

    // 1. Property edits on items.
    const propPatch: ItemUpdate = {};
    if (patch.name !== undefined) propPatch.name = patch.name;
    if (patch.sku !== undefined) propPatch.sku = patch.sku;
    if (patch.uom !== undefined) propPatch.uom = patch.uom;
    if (patch.is_active !== undefined) propPatch.is_active = patch.is_active;

    if (Object.keys(propPatch).length > 0) {
      const { error } = await supabase
        .from('items')
        .update(propPatch)
        .eq('id', patch.id);
      if (error) {
        result.failed++;
        result.errors.push({ id: patch.id, message: error.message });
        continue;
      }
    }

    // 2. New version via set_item_rate if rate or ration_scale supplied.
    if (patch.rate !== undefined || patch.ration_scale !== undefined) {
      // set_item_rate requires a rate. If only ration_scale changed but the
      // caller didn't pass a rate, we need to read the current rate first.
      let nextRate = patch.rate;
      if (nextRate === undefined) {
        const { data: cur } = await supabase
          .from('v_items_current')
          .select('current_rate')
          .eq('id', patch.id)
          .maybeSingle();
        nextRate = cur?.current_rate ?? undefined;
      }
      if (nextRate === undefined || nextRate === null) {
        result.failed++;
        result.errors.push({
          id: patch.id,
          message: 'No current rate; supply a rate when editing the scale',
        });
        continue;
      }

      const { error: rpcErr } = await supabase.rpc('set_item_rate', {
        p_item_id: patch.id,
        p_rate: nextRate,
        ...(patch.ration_scale !== undefined
          ? { p_ration_scale: patch.ration_scale ?? undefined }
          : {}),
        ...(patch.notes ? { p_notes: patch.notes } : {}),
        p_effective_at: new Date().toISOString(),
      });
      if (rpcErr) {
        result.failed++;
        result.errors.push({ id: patch.id, message: rpcErr.message });
        continue;
      }
    }

    result.updated++;
  }

  if (result.updated > 0) revalidateMasters();
  return { ok: true, result };
}

export async function deactivateMasterItemAction(_prev: unknown, formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Missing id' };
  const supabase = await createClient();
  const { data: existing } = await supabase.from('items').select('unit_id, category').eq('id', id).single();
  if (!existing) return { error: 'Item not found' };
  const cap = existing.unit_id ? 'masters.write' : 'masters.write.global';
  await requireCapability(cap, existing.unit_id ?? null);
  const { error } = await supabase.from('items').update({ is_active: false }).eq('id', id);
  if (error) return { error: error.message };
  revalidateMasters();
  return { ok: true };
}
