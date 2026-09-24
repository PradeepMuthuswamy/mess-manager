'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/mongo';
import { requireCapability } from '@/lib/auth/require-capability';
import { requireUser } from '@/lib/auth/require-role';
import { writeAudit } from '@/lib/audit/write-audit';
import {
  updateLotSchema,
  adjustQtySchema,
} from '@/lib/schemas/inventory';

const INVENTORY_WRITE = 'inventory.write';

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

function toDateString(d: Date | null | undefined): string | null | undefined {
  if (d === undefined) return undefined;
  if (d === null) return null;
  return d.toISOString().slice(0, 10);
}

export async function updateLotAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Missing id' };

  const db = await getDb();
  const existing = await db.collection('unit_inventory').findOne({ id });
  if (!existing) return { error: 'Lot not found' };

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

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    updated_at: now,
    updated_by: user.id,
  };
  if (parsed.data.pack_size_id !== undefined) patch.variant_id = parsed.data.pack_size_id;
  if (parsed.data.rate !== undefined) patch.rate = parsed.data.rate;
  if (parsed.data.acquired_on !== undefined) patch.acquired_on = toDateString(parsed.data.acquired_on);
  if (parsed.data.source !== undefined) patch.source = parsed.data.source;
  if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active;

  await db.collection('unit_inventory').updateOne(
    { id },
    { $set: patch },
  );

  await writeAudit({
    table_name: 'unit_inventory',
    row_pk: id,
    op: 'UPDATE',
    active_unit_id: existing.unit_id,
    changed_by: user.id,
    old_data: existing,
    new_data: { ...existing, ...patch },
  });

  revalidateStock();
  return { ok: true };
}

export async function adjustQtyAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = adjustQtySchema.safeParse({
    id: formData.get('id'),
    qty_packs: formData.get('qty_packs'),
  });
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  const db = await getDb();
  const existing = await db.collection('unit_inventory').findOne({ id: parsed.data.id });
  if (!existing) return { error: 'Lot not found' };

  await requireCapability(INVENTORY_WRITE, existing.unit_id);

  const now = new Date().toISOString();
  await db.collection('unit_inventory').updateOne(
    { id: parsed.data.id },
    {
      $set: {
        qty_packs: parsed.data.qty_packs,
        updated_at: now,
        updated_by: user.id,
      },
    },
  );

  await writeAudit({
    table_name: 'unit_inventory',
    row_pk: parsed.data.id,
    op: 'UPDATE',
    active_unit_id: existing.unit_id,
    changed_by: user.id,
    old_data: existing,
    new_data: { ...existing, qty_packs: parsed.data.qty_packs, updated_at: now },
  });

  revalidateStock();
  return { ok: true };
}

export async function deactivateLotAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Missing id' };

  const db = await getDb();
  const existing = await db.collection('unit_inventory').findOne({ id });
  if (!existing) return { error: 'Lot not found' };

  await requireCapability(INVENTORY_WRITE, existing.unit_id);

  const now = new Date().toISOString();
  await db.collection('unit_inventory').updateOne(
    { id },
    {
      $set: {
        is_active: false,
        updated_at: now,
        updated_by: user.id,
      },
    },
  );

  await writeAudit({
    table_name: 'unit_inventory',
    row_pk: id,
    op: 'UPDATE',
    active_unit_id: existing.unit_id,
    changed_by: user.id,
    old_data: existing,
    new_data: { ...existing, is_active: false, updated_at: now },
  });

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
  const user = await requireUser();
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

  const db = await getDb();
  const variantIds = lots.map((l) => l.variant_id);

  // Check if any variant is in grocery category
  const groceryVariants = await db.collection('product_variants').aggregate([
    { $match: { id: { $in: variantIds } } },
    {
      $lookup: {
        from: 'products',
        localField: 'product_id',
        foreignField: 'id',
        as: 'product',
      },
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'categories',
        localField: 'product.category_id',
        foreignField: 'id',
        as: 'category',
      },
    },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    { $match: { 'category.slug': 'grocery' } },
  ]).toArray();

  if (groceryVariants.length > 0) {
    return { error: 'Adding stock for grocery items is disabled' };
  }

  const now = new Date().toISOString();
  const docs = lots.map((l) => {
    const lotId = crypto.randomUUID();
    return {
      id: lotId,
      unit_id: l.unit_id,
      variant_id: l.variant_id,
      qty_packs: l.qty_packs,
      rate: l.rate,
      acquired_on: l.acquired_on ? l.acquired_on.slice(0, 10) : null,
      source: l.source ?? null,
      is_active: true,
      created_at: now,
      updated_at: now,
      created_by: user.id,
      updated_by: user.id,
    };
  });

  await db.collection('unit_inventory').insertMany(docs);

  for (const doc of docs) {
    await writeAudit({
      table_name: 'unit_inventory',
      row_pk: doc.id,
      op: 'INSERT',
      active_unit_id: doc.unit_id,
      changed_by: user.id,
      new_data: doc,
    });
  }

  revalidateStock();
  return { ok: true };
}
