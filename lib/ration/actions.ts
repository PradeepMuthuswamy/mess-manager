'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/require-role';
import { requireCapability, userHasCapability } from '@/lib/auth/require-capability';
import {
  createScaleSchema,
  updateScaleSchema,
  upsertScaleItemSchema,
  bulkUpdateScaleItemsSchema,
  saveDailyConsumptionSchema,
  createRationStockTransactionSchema,
} from '@/lib/schemas/ration';
import { bulkImportScaleRowSchema, type BulkImportScaleRow } from './bulk-import';
import type { Database } from '@/lib/supabase/database.types';
import type { RationScaleItemVersionRow } from './types';

type Sb = Awaited<ReturnType<typeof createClient>>;

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

function revalidateRationLedger() {
  revalidatePath('/ration');
  revalidatePath('/ration/consumption');
  revalidatePath('/ration/ledger');
}

/** Post/rollback accept either issue (Mess Havildar) or adjust. requireCapability redirects, it does not throw. */
async function requireRationIssueOrAdjust(unitId: string) {
  const user = await requireUser();
  const cap = userHasCapability(user, 'ration.issue', unitId)
    ? 'ration.issue'
    : 'ration.adjust';
  await requireCapability(cap, unitId);
}

async function assertAttendanceFinalized(
  supabase: Sb,
  unitId: string,
  date: string,
): Promise<{ error: string } | null> {
  const { data: day, error } = await supabase
    .from('attendance_days')
    .select('status')
    .eq('unit_id', unitId)
    .eq('attendance_date', date)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!day) {
    return {
      error:
        'Attendance for this date is missing. Finalize attendance before posting ration consumption.',
    };
  }
  if (day.status !== 'finalized') {
    return {
      error:
        'Attendance for this date is still draft. Finalize attendance before posting ration consumption.',
    };
  }
  return null;
}

async function lastReceiptRateByVariant(
  supabase: Sb,
  unitId: string,
  variantIds: string[],
): Promise<Map<string, number>> {
  const rates = new Map<string, number>();
  if (variantIds.length === 0) return rates;
  const { data } = await supabase
    .from('ration_stock_transactions')
    .select('variant_id, rate')
    .eq('unit_id', unitId)
    .eq('type', 'receipt')
    .in('variant_id', variantIds)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });
  for (const row of data ?? []) {
    if (rates.has(row.variant_id)) continue;
    const rate = Number(row.rate);
    rates.set(row.variant_id, Number.isFinite(rate) ? rate : 0);
  }
  return rates;
}

async function deleteConsumptionStockTxs(
  supabase: Sb,
  unitId: string,
  transactionDate: string,
) {
  return supabase
    .from('ration_stock_transactions')
    .delete()
    .eq('unit_id', unitId)
    .eq('transaction_date', transactionDate)
    .eq('type', 'consumption');
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
    .select('variant_id, auth_qty, uom')
    .eq('scale_id', parsed.data.scale_id)
    .is('valid_to', null)
    .in('variant_id', parsed.data.item_ids);
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
    const row = (current ?? []).find((r) => r.variant_id === itemId);
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
      p_variant_id: itemId,
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
    p_variant_id: parsed.data.item_id,
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
    .eq('variant_id', itemId)
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
      .from('v_items_current')
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
      p_variant_id: matches[0].id!,
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
      'id, scale_id, variant_id, auth_qty, uom, notes, valid_from, valid_to, created_at, created_by',
    )
    .eq('scale_id', scaleId)
    .eq('variant_id', itemId)
    .order('valid_from', { ascending: false });
  if (error) return { error: error.message };

  return { ok: true, rows: (data ?? []) as RationScaleItemVersionRow[] };
}

export async function postDailyRationConsumptionAction(input: {
  unit_id: string;
  consumption_date: string;
  items: Array<{
    variant_id: string;
    quantity: number;
  }>;
}): Promise<{ ok?: boolean; error?: string }> {
  const parsed = saveDailyConsumptionSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid input' };

  const { unit_id, consumption_date, items } = parsed.data;

  await requireRationIssueOrAdjust(unit_id);

  const supabase = await createClient();
  const attendanceErr = await assertAttendanceFinalized(
    supabase,
    unit_id,
    consumption_date,
  );
  if (attendanceErr) return attendanceErr;

  const { error } = await supabase
    .from('ration_consumptions')
    .upsert(
      items.map((i) => ({
        unit_id,
        consumption_date,
        variant_id: i.variant_id,
        quantity: i.quantity,
      })),
      { onConflict: 'unit_id,consumption_date,variant_id' },
    );

  if (error) return { error: error.message };

  if (items.length > 0) {
    const { error: delTxErr } = await deleteConsumptionStockTxs(
      supabase,
      unit_id,
      consumption_date,
    );
    if (delTxErr) return { error: delTxErr.message };

    const rates = await lastReceiptRateByVariant(
      supabase,
      unit_id,
      items.map((i) => i.variant_id),
    );
    const { error: insTxErr } = await supabase
      .from('ration_stock_transactions')
      .insert(
        items.map((i) => ({
          unit_id,
          variant_id: i.variant_id,
          transaction_date: consumption_date,
          type: 'consumption',
          quantity: Number(i.quantity),
          rate: rates.get(i.variant_id) ?? 0,
          amount: 0,
        })),
      );
    if (insTxErr) return { error: insTxErr.message };
  }

  revalidateRationLedger();
  return { ok: true };
}

export async function rollbackDailyRationConsumptionAction(input: {
  unit_id: string;
  consumption_date: string;
}): Promise<{ ok?: boolean; error?: string }> {
  if (!input.unit_id || !input.consumption_date) return { error: 'Missing input' };

  await requireRationIssueOrAdjust(input.unit_id);

  const supabase = await createClient();
  const { error } = await supabase
    .from('ration_consumptions')
    .delete()
    .eq('unit_id', input.unit_id)
    .eq('consumption_date', input.consumption_date);

  if (error) return { error: error.message };

  const { error: txErr } = await deleteConsumptionStockTxs(
    supabase,
    input.unit_id,
    input.consumption_date,
  );
  if (txErr) return { error: txErr.message };

  revalidateRationLedger();
  return { ok: true };
}

export async function createRationStockTransactionAction(input: {
  unit_id: string;
  variant_id: string;
  transaction_date: string;
  type: 'receipt' | 'adjustment' | 'return_to_source';
  quantity: number;
  rate: number;
  amount: number;
  source?: string;
  notes?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const quantity = Number(input.quantity);
  const rate = Number(input.rate);
  const amount = Number(input.amount);
  if (!Number.isFinite(quantity) || !Number.isFinite(rate) || !Number.isFinite(amount)) {
    return { error: 'Invalid input' };
  }
  if (input.type === 'adjustment') {
    if (quantity === 0) return { error: 'Invalid input' };
  } else if (quantity <= 0) {
    return { error: 'Invalid input' };
  }

  // Sibling schema may allow signed adjustment qty, or still require positive().
  const coerced = { ...input, quantity, rate, amount: Math.abs(amount) };
  let parsed = createRationStockTransactionSchema.safeParse(coerced);
  if (!parsed.success && input.type === 'adjustment') {
    parsed = createRationStockTransactionSchema.safeParse({
      ...coerced,
      quantity: Math.abs(quantity),
    });
  }
  if (!parsed.success) return { error: 'Invalid input' };

  const { unit_id } = parsed.data;
  await requireCapability('ration.adjust', unit_id);

  const supabase = await createClient();
  const { error } = await supabase.from('ration_stock_transactions').insert({
    unit_id,
    variant_id: parsed.data.variant_id,
    transaction_date: parsed.data.transaction_date,
    type: parsed.data.type,
    quantity: input.type === 'adjustment' ? quantity : parsed.data.quantity,
    rate: parsed.data.rate,
    amount: parsed.data.amount,
    source: parsed.data.source || null,
    notes: parsed.data.notes || null,
  });

  if (error) return { error: error.message };

  revalidateRationLedger();
  return { ok: true };
}


