'use server';

import { revalidatePath } from 'next/cache';
import { getCollection, getDb } from '@/lib/mongo';
import { requireUser } from '@/lib/auth/require-role';
import { requireCapability, userHasCapability } from '@/lib/auth/require-capability';
import { writeAudit } from '@/lib/audit/write-audit';
import { getAttendanceDay } from '@/lib/attendance/queries';
import {
  createScaleSchema,
  updateScaleSchema,
  upsertScaleItemSchema,
  bulkUpdateScaleItemsSchema,
  saveDailyConsumptionSchema,
  createRationStockTransactionSchema,
} from '@/lib/schemas/ration';
import { bulkImportScaleRowSchema, type BulkImportScaleRow } from './bulk-import';
import type { RationScale, RationScaleItemVersionRow } from './types';

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
  unitId: string,
  date: string,
): Promise<{ error: string } | null> {
  try {
    const day = await getAttendanceDay(unitId, date);
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
  } catch (err: unknown) {
    return { error: err.message ?? 'Failed to check attendance status' };
  }
  return null;
}

async function lastReceiptRateByVariant(
  unitId: string,
  variantIds: string[],
): Promise<Map<string, number>> {
  const rates = new Map<string, number>();
  if (variantIds.length === 0) return rates;

  const col = await getCollection('ration_stock_transactions');
  const rows = await col
    .find({
      unit_id: unitId,
      type: 'receipt',
      variant_id: { $in: variantIds },
    })
    .sort({ transaction_date: -1, created_at: -1 })
    .toArray();

  for (const row of rows) {
    const vId = String(row.variant_id);
    if (rates.has(vId)) continue;
    const rate = Number(row.rate);
    rates.set(vId, Number.isFinite(rate) ? rate : 0);
  }
  return rates;
}

async function deleteConsumptionStockTxs(
  unitId: string,
  transactionDate: string,
) {
  const col = await getCollection('ration_stock_transactions');
  return col.deleteMany({
    unit_id: unitId,
    transaction_date: transactionDate,
    type: 'consumption',
  });
}

/**
 * Direct replacement for Postgres RPC `set_ration_scale_item`.
 * Manages SCD-2 versioning directly in `ration_scale_item_versions` collection.
 */
async function directSetRationScaleItem(params: {
  scaleId: string;
  variantId: string;
  authQty: number;
  uom: string;
  notes?: string | null;
  effectiveAt?: string;
  userId?: string | null;
}): Promise<string> {
  const versionsCol = await getCollection('ration_scale_item_versions');
  const effective = params.effectiveAt || new Date().toISOString();
  const now = new Date().toISOString();

  const existing = await versionsCol.findOne({
    scale_id: params.scaleId,
    variant_id: params.variantId,
    $or: [{ valid_to: null }, { valid_to: { $exists: false } }],
  });

  if (
    existing &&
    Number(existing.auth_qty) === Number(params.authQty) &&
    existing.uom === params.uom &&
    (existing.notes ?? '') === (params.notes ?? '')
  ) {
    return String(existing.id);
  }

  if (existing) {
    await versionsCol.updateMany(
      {
        scale_id: params.scaleId,
        variant_id: params.variantId,
        $or: [{ valid_to: null }, { valid_to: { $exists: false } }],
      },
      { $set: { valid_to: effective } },
    );
  }

  const newId = crypto.randomUUID();
  const newDoc = {
    id: newId,
    scale_id: params.scaleId,
    variant_id: params.variantId,
    auth_qty: params.authQty,
    uom: params.uom,
    notes: params.notes ?? null,
    valid_from: effective,
    valid_to: null,
    created_by: params.userId ?? null,
    created_at: now,
  };
  await versionsCol.insertOne(newDoc);

  return newId;
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
  const user = await requireUser();

  const col = await getCollection<RationScale>('ration_scales');
  const existing = await col.findOne({
    unit_id: parsed.data.unit_id,
    rank_class: parsed.data.rank_class,
    terrain: parsed.data.terrain,
  });
  if (existing) {
    return { error: 'A scale for that rank class and terrain already exists in this unit' };
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const doc: RationScale = {
    id,
    unit_id: parsed.data.unit_id,
    name: parsed.data.name,
    rank_class: parsed.data.rank_class,
    terrain: parsed.data.terrain,
    description: parsed.data.description ?? null,
    is_active: true,
    created_at: now,
    updated_at: now,
    created_by: user.id,
    updated_by: user.id,
  };

  await col.insertOne(doc);
  await writeAudit({
    table_name: 'ration_scales',
    row_pk: id,
    op: 'INSERT',
    changed_by: user.id,
    active_unit_id: parsed.data.unit_id,
    new_data: doc as unknown as Record<string, unknown>,
  });

  revalidateRation();
  return { ok: true, id };
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

  const scalesCol = await getCollection<RationScale>('ration_scales');
  const scale = await scalesCol.findOne({ id: parsed.data.scale_id });
  if (!scale || !scale.unit_id) return { error: 'Scale not found' };

  await requireCapability('ration.adjust', scale.unit_id);
  const user = await requireUser();

  const versionsCol = await getCollection('ration_scale_item_versions');
  const current = await versionsCol
    .find({
      scale_id: parsed.data.scale_id,
      $or: [{ valid_to: null }, { valid_to: { $exists: false } }],
      variant_id: { $in: parsed.data.item_ids },
    })
    .toArray();

  const result: BulkUpdateScaleResult = {
    attempted: parsed.data.item_ids.length,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const effective = new Date().toISOString();

  for (const itemId of parsed.data.item_ids) {
    const row = current.find((r) => r.variant_id === itemId);
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

    try {
      await directSetRationScaleItem({
        scaleId: parsed.data.scale_id,
        variantId: itemId,
        authQty: next,
        uom: String(row.uom),
        notes: parsed.data.notes ?? row.notes,
        effectiveAt: effective,
        userId: user.id,
      });
      result.updated++;
    } catch (err: unknown) {
      result.failed++;
      result.errors.push({ item_id: itemId, message: err.message || 'Update failed' });
    }
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

  const scalesCol = await getCollection<RationScale>('ration_scales');
  const existing = await scalesCol.findOne({ id });
  if (!existing || !existing.unit_id) return { error: 'Scale not found' };

  await requireCapability('ration.adjust', existing.unit_id);
  const user = await requireUser();

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description ?? null;
  if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active;

  await scalesCol.updateOne({ id }, { $set: patch });

  await writeAudit({
    table_name: 'ration_scales',
    row_pk: id,
    op: 'UPDATE',
    changed_by: user.id,
    active_unit_id: existing.unit_id,
    old_data: existing as unknown as Record<string, unknown>,
    new_data: patch,
  });

  revalidateRation(id);
  return { ok: true };
}

export async function deleteScaleAction(_prev: unknown, formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Missing id' };

  const scalesCol = await getCollection<RationScale>('ration_scales');
  const existing = await scalesCol.findOne({ id });
  if (!existing || !existing.unit_id) return { error: 'Scale not found' };

  await requireCapability('ration.adjust', existing.unit_id);
  const user = await requireUser();

  const patch = {
    is_active: false,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  await scalesCol.updateOne({ id }, { $set: patch });

  await writeAudit({
    table_name: 'ration_scales',
    row_pk: id,
    op: 'UPDATE',
    changed_by: user.id,
    active_unit_id: existing.unit_id,
    old_data: existing as unknown as Record<string, unknown>,
    new_data: patch,
  });

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

  const scalesCol = await getCollection<RationScale>('ration_scales');
  const scale = await scalesCol.findOne({ id: scaleId });
  if (!scale || !scale.unit_id) return { error: 'Scale not found' };

  await requireCapability('ration.adjust', scale.unit_id);
  const user = await requireUser();

  const effective = parsed.data.effective_at
    ? new Date(parsed.data.effective_at).toISOString()
    : new Date().toISOString();

  const versionId = await directSetRationScaleItem({
    scaleId,
    variantId: parsed.data.item_id,
    authQty: parsed.data.auth_qty,
    uom: parsed.data.uom,
    notes: parsed.data.notes ?? null,
    effectiveAt: effective,
    userId: user.id,
  });

  await writeAudit({
    table_name: 'ration_scale_item_versions',
    row_pk: versionId,
    op: 'INSERT',
    changed_by: user.id,
    active_unit_id: scale.unit_id,
    new_data: {
      scale_id: scaleId,
      variant_id: parsed.data.item_id,
      auth_qty: parsed.data.auth_qty,
      uom: parsed.data.uom,
      notes: parsed.data.notes ?? null,
      valid_from: effective,
    },
  });

  revalidateRation(scaleId);
  return { ok: true, version_id: versionId };
}

export async function removeScaleItemAction(_prev: unknown, formData: FormData) {
  const scaleId = String(formData.get('scale_id') ?? '');
  const itemId = String(formData.get('item_id') ?? '');
  if (!scaleId || !itemId) return { error: 'Missing scale_id or item_id' };

  const scalesCol = await getCollection<RationScale>('ration_scales');
  const scale = await scalesCol.findOne({ id: scaleId });
  if (!scale || !scale.unit_id) return { error: 'Scale not found' };

  await requireCapability('ration.adjust', scale.unit_id);
  const user = await requireUser();

  const versionsCol = await getCollection('ration_scale_item_versions');
  const now = new Date().toISOString();

  await versionsCol.updateMany(
    {
      scale_id: scaleId,
      variant_id: itemId,
      $or: [{ valid_to: null }, { valid_to: { $exists: false } }],
    },
    { $set: { valid_to: now } },
  );

  await writeAudit({
    table_name: 'ration_scale_item_versions',
    row_pk: `${scaleId}:${itemId}`,
    op: 'UPDATE',
    changed_by: user.id,
    active_unit_id: scale.unit_id,
    new_data: { valid_to: now },
  });

  revalidateRation(scaleId);
  return { ok: true };
}

export async function bulkImportScaleItemsAction(input: {
  scale_id: string;
  rows: Array<Record<string, unknown>>;
}): Promise<{ ok?: boolean; result?: BulkImportScaleResult; error?: string }> {
  if (!input.scale_id) return { error: 'Missing scale_id' };

  const scalesCol = await getCollection<RationScale>('ration_scales');
  const scale = await scalesCol.findOne({ id: input.scale_id });
  if (!scale || !scale.unit_id) return { error: 'Scale not found' };

  await requireCapability('ration.adjust', scale.unit_id);
  const user = await requireUser();

  const result: BulkImportScaleResult = {
    total: input.rows.length,
    inserted: 0,
    failed: 0,
    errors: [],
  };

  const db = await getDb();
  const effective = new Date().toISOString();

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

    // Resolve item_id by name in MongoDB
    const pipeline: Record<string, unknown>[] = [
      {
        $match: {
          name: { $regex: `^${row.item_name.trim()}$`, $options: 'i' },
          is_active: { $ne: false },
        },
      },
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
      { $limit: 2 },
    ];

    const matches = await db.collection('products').aggregate(pipeline).toArray();

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

    try {
      await directSetRationScaleItem({
        scaleId: input.scale_id,
        variantId: matches[0].variants.id,
        authQty: row.auth_qty,
        uom: row.uom,
        notes: row.notes ?? null,
        effectiveAt: effective,
        userId: user.id,
      });
      result.inserted++;
    } catch (err: unknown) {
      result.failed++;
      result.errors.push({ rowNumber, name: row.item_name, message: err.message || 'Import failed' });
    }
  }

  revalidateRation(input.scale_id);
  return { ok: true, result };
}

export async function getScaleItemHistoryAction(
  scaleId: string,
  itemId: string,
): Promise<{ ok?: boolean; rows?: RationScaleItemVersionRow[]; error?: string }> {
  if (!scaleId || !itemId) return { error: 'Missing scale_id or item_id' };

  const scalesCol = await getCollection<RationScale>('ration_scales');
  const scale = await scalesCol.findOne({ id: scaleId });
  if (!scale || !scale.unit_id) return { error: 'Scale not found' };

  await requireCapability('ration.read', scale.unit_id);

  const versionsCol = await getCollection('ration_scale_item_versions');
  const rows = await versionsCol
    .find({ scale_id: scaleId, variant_id: itemId })
    .sort({ valid_from: -1 })
    .toArray();

  return {
    ok: true,
    rows: rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      scale_id: String(r.scale_id),
      variant_id: String(r.variant_id),
      auth_qty: Number(r.auth_qty),
      uom: String(r.uom),
      notes: r.notes ? String(r.notes) : null,
      valid_from: String(r.valid_from),
      valid_to: r.valid_to ? String(r.valid_to) : null,
      created_at: String(r.created_at),
      created_by: r.created_by ? String(r.created_by) : null,
    })),
  };
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
  const user = await requireUser();

  const attendanceErr = await assertAttendanceFinalized(unit_id, consumption_date);
  if (attendanceErr) return attendanceErr;

  const consCol = await getCollection('ration_consumptions');
  const now = new Date().toISOString();

  for (const item of items) {
    await consCol.updateOne(
      {
        unit_id,
        consumption_date,
        variant_id: item.variant_id,
      },
      {
        $set: {
          quantity: item.quantity,
          updated_at: now,
          updated_by: user.id,
        },
        $setOnInsert: {
          id: crypto.randomUUID(),
          created_at: now,
          created_by: user.id,
        },
      },
      { upsert: true },
    );
  }

  if (items.length > 0) {
    await deleteConsumptionStockTxs(unit_id, consumption_date);

    const rates = await lastReceiptRateByVariant(
      unit_id,
      items.map((i) => i.variant_id),
    );

    const txCol = await getCollection('ration_stock_transactions');
    const newTxs = items.map((i) => ({
      id: crypto.randomUUID(),
      unit_id,
      variant_id: i.variant_id,
      transaction_date: consumption_date,
      type: 'consumption',
      quantity: Number(i.quantity),
      rate: rates.get(i.variant_id) ?? 0,
      amount: 0,
      source: null,
      notes: null,
      created_at: now,
      updated_at: now,
      created_by: user.id,
      updated_by: user.id,
    }));
    await txCol.insertMany(newTxs);
  }

  await writeAudit({
    table_name: 'ration_consumptions',
    row_pk: `${unit_id}:${consumption_date}`,
    op: 'INSERT',
    changed_by: user.id,
    active_unit_id: unit_id,
    new_data: { items_count: items.length },
  });

  revalidateRationLedger();
  return { ok: true };
}

export async function rollbackDailyRationConsumptionAction(input: {
  unit_id: string;
  consumption_date: string;
}): Promise<{ ok?: boolean; error?: string }> {
  if (!input.unit_id || !input.consumption_date) return { error: 'Missing input' };

  await requireRationIssueOrAdjust(input.unit_id);
  const user = await requireUser();

  const consCol = await getCollection('ration_consumptions');
  await consCol.deleteMany({
    unit_id: input.unit_id,
    consumption_date: input.consumption_date,
  });

  await deleteConsumptionStockTxs(input.unit_id, input.consumption_date);

  await writeAudit({
    table_name: 'ration_consumptions',
    row_pk: `${input.unit_id}:${input.consumption_date}`,
    op: 'DELETE',
    changed_by: user.id,
    active_unit_id: input.unit_id,
  });

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
  const user = await requireUser();

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const txCol = await getCollection('ration_stock_transactions');
  const doc = {
    id,
    unit_id,
    variant_id: parsed.data.variant_id,
    transaction_date: parsed.data.transaction_date,
    type: parsed.data.type,
    quantity: input.type === 'adjustment' ? quantity : parsed.data.quantity,
    rate: parsed.data.rate,
    amount: parsed.data.amount,
    source: parsed.data.source || null,
    notes: parsed.data.notes || null,
    created_at: now,
    updated_at: now,
    created_by: user.id,
    updated_by: user.id,
  };
  await txCol.insertOne(doc);

  await writeAudit({
    table_name: 'ration_stock_transactions',
    row_pk: id,
    op: 'INSERT',
    changed_by: user.id,
    active_unit_id: unit_id,
    new_data: doc,
  });

  revalidateRationLedger();
  return { ok: true };
}
