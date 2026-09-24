'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/mongo';
import { writeAudit } from '@/lib/audit/write-audit';
import { requireCapability } from '@/lib/auth/require-capability';
import { requireUser } from '@/lib/auth/require-role';
import { createBarChitSchema, type CreateBarChitInput } from '@/lib/schemas';

type ActionResult = {
  ok?: boolean;
  error?: string;
  id?: string;
};

/**
 * Core business logic for creating a bar chit and depletions.
 * Shared between Server Action and REST API.
 */
export async function createBarChitCore(
  clientOrUserId: unknown,
  userIdOrData: unknown,
  maybeData?: CreateBarChitInput,
): Promise<ActionResult> {
  let userId: string;
  let data: CreateBarChitInput;

  if (typeof clientOrUserId === 'string') {
    userId = clientOrUserId;
    data = userIdOrData as CreateBarChitInput;
  } else {
    userId = userIdOrData as string;
    data = maybeData as CreateBarChitInput;
  }

  const { unit_id, date, consumer_type, profile_id, guest_name, booking_id, items } = data;

  if (consumer_type === 'member' && !profile_id) {
    return { error: 'Profile is required for members' };
  }
  if (consumer_type === 'guest' && !guest_name) {
    return { error: 'Guest name is required for guests' };
  }

  const db = await getDb();
  const variantsCol = db.collection('product_variants');
  const invCol = db.collection('unit_inventory');
  const chitsCol = db.collection('bar_chits');
  const chitItemsCol = db.collection('bar_chit_items');

  // Normalize peg quantities/rates to bottle units
  const normalizedItems = [];
  for (const item of items) {
    const adopted = await isAdoptedVariant(unit_id, item.variant_id);
    if (!adopted) {
      return { error: `${item.name} is not an adopted catalog item for this unit` };
    }

    let quantity = item.quantity;
    let rate = item.rate;

    if (rate == null || rate === 0) {
      const menuRate = await getLatestMenuRate(unit_id, item.variant_id, date);
      if (menuRate == null || menuRate === 0) {
        return { error: `No menu rate set for ${item.name}` };
      }
      rate = menuRate;
    }

    if (item.unit === 'peg') {
      const variant = await variantsCol.findOne({ id: item.variant_id });
      if (!variant) {
        return { error: `Failed to retrieve details for ${item.name}: Not found` };
      }

      const unitValue = Number(variant.unit_value ?? 0);
      let volumeMl = 0;
      if (variant.unit_type === 'ML') {
        volumeMl = unitValue;
      } else if (variant.unit_type === 'LITRE') {
        volumeMl = unitValue * 1000;
      } else if (variant.unit_type === 'PIECE' && variant.package_type === 'BOTTLE') {
        volumeMl = 750; // default standard bottle volume (25 pegs)
      }

      if (volumeMl <= 0) {
        return { error: `Cannot use peg unit for non-liquid item ${item.name}` };
      }

      const pegsPerBottle = volumeMl / 30;
      quantity = item.quantity / pegsPerBottle;
      rate = rate * pegsPerBottle;
    }

    normalizedItems.push({
      variant_id: item.variant_id,
      lot_id: item.lot_id,
      name: item.name,
      quantity,
      rate,
    });
  }

  // 1. Validate stock availability for each item first (FIFO check)
  for (const item of normalizedItems) {
    const lots = await invCol
      .find({
        unit_id,
        variant_id: item.variant_id,
        is_active: { $ne: false },
        qty_packs: { $gt: 0 },
      })
      .toArray();

    const totalAvailable = lots.reduce((sum, lot) => sum + Number(lot.qty_packs ?? 0), 0);
    // Allow slight floating point tolerance on stock checks
    if (totalAvailable + 0.0001 < item.quantity) {
      return {
        error: `Insufficient stock for ${item.name}. Requested: ${item.quantity.toFixed(3)} bottles, Available: ${totalAvailable.toFixed(3)} bottles`,
      };
    }
  }

  // 2. Calculate total amount
  const total_amount = normalizedItems.reduce((sum, item) => sum + item.quantity * item.rate, 0);

  // 3. Create the chit header
  const now = new Date().toISOString();
  const chitId = crypto.randomUUID();

  const chitDoc = {
    id: chitId,
    unit_id,
    date,
    profile_id: consumer_type === 'member' ? profile_id : null,
    guest_name: consumer_type === 'guest' ? guest_name : null,
    booking_id: consumer_type === 'guest' ? booking_id : null,
    total_amount,
    status: 'pending',
    created_by: userId,
    created_at: now,
    updated_at: now,
  };

  await chitsCol.insertOne(chitDoc);
  await writeAudit({
    table_name: 'bar_chits',
    row_pk: chitId,
    op: 'INSERT',
    changed_by: userId,
    active_unit_id: unit_id,
    new_data: chitDoc,
  });

  // 4. Insert chit items and deplete inventory
  for (const item of normalizedItems) {
    // A. Insert bar_chit_item
    const itemAmount = item.quantity * item.rate;
    const itemId = crypto.randomUUID();
    const itemDoc = {
      id: itemId,
      chit_id: chitId,
      variant_id: item.variant_id,
      quantity: item.quantity,
      rate: item.rate,
      amount: itemAmount,
      created_at: now,
      updated_at: now,
    };

    try {
      await chitItemsCol.insertOne(itemDoc);
      await writeAudit({
        table_name: 'bar_chit_items',
        row_pk: itemId,
        op: 'INSERT',
        changed_by: userId,
        active_unit_id: unit_id,
        new_data: itemDoc,
      });
    } catch (lineErr: unknown) {
      // Clean up header in case of failure
      await chitsCol.deleteOne({ id: chitId });
      return { error: `Failed to insert line item for ${item.name}: ${(lineErr instanceof Error ? lineErr.message : String(lineErr))}` };
    }

    // B. Deplete inventory lots (FIFO)
    let remainingToDeplete = item.quantity;

    // Fetch lots sorted by acquired_on ascending (or created_at if null) to ensure FIFO
    const lots = await invCol
      .find({
        unit_id,
        variant_id: item.variant_id,
        is_active: { $ne: false },
        qty_packs: { $gt: 0 },
      })
      .sort({ acquired_on: 1, created_at: 1 })
      .toArray();

    // Prioritize depletion of the explicitly selected lot
    if (item.lot_id) {
      lots.sort((a, b) => {
        if (a.id === item.lot_id) return -1;
        if (b.id === item.lot_id) return 1;
        return 0;
      });
    }

    for (const lot of lots) {
      if (remainingToDeplete <= 0.0001) break;

      const currentLotQty = Number(lot.qty_packs ?? 0);

      if (currentLotQty <= remainingToDeplete + 0.0001) {
        // Fully deplete this lot
        remainingToDeplete = Math.max(0, remainingToDeplete - currentLotQty);

        const patch = {
          qty_packs: 0,
          is_active: false,
          updated_at: now,
        };

        await invCol.updateOne({ id: lot.id }, { $set: patch });
        await writeAudit({
          table_name: 'unit_inventory',
          row_pk: lot.id,
          op: 'UPDATE',
          changed_by: userId,
          active_unit_id: unit_id,
          old_data: lot,
          new_data: { ...lot, ...patch },
        });
      } else {
        // Partially deplete this lot
        const newLotQty = currentLotQty - remainingToDeplete;
        remainingToDeplete = 0;

        const patch = {
          qty_packs: newLotQty,
          updated_at: now,
        };

        await invCol.updateOne({ id: lot.id }, { $set: patch });
        await writeAudit({
          table_name: 'unit_inventory',
          row_pk: lot.id,
          op: 'UPDATE',
          changed_by: userId,
          active_unit_id: unit_id,
          old_data: lot,
          new_data: { ...lot, ...patch },
        });
      }
    }
  }

  return { ok: true, id: chitId };
}

async function isAdoptedVariant(
  unitId: string,
  variantId: string,
): Promise<boolean> {
  const db = await getDb();
  const doc = await db.collection('unit_catalog').findOne({
    unit_id: unitId,
    variant_id: variantId,
    is_enabled: true,
  });

  return doc != null;
}

/** Latest committee sale rate as of the chit date. Snapshot this onto bar_chit_items — never rewrite later. */
async function getLatestMenuRate(
  unitId: string,
  variantId: string,
  asOfDate: string,
): Promise<number | null> {
  const db = await getDb();
  const doc = await db
    .collection('unit_menu_rates')
    .find({
      unit_id: unitId,
      variant_id: variantId,
      effective_from: { $lte: asOfDate },
    })
    .sort({ effective_from: -1 })
    .limit(1)
    .next();

  if (!doc) return null;
  return Number(doc.rate);
}

export async function createBarChitAction(
  _prev: unknown,
  payload: unknown,
): Promise<ActionResult> {
  // 1. Authenticate user
  const user = await requireUser();

  // 2. Validate input payload
  const parsed = createBarChitSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: 'Invalid input data: ' + parsed.error.issues.map((i) => i.message).join(', ') };
  }

  const { unit_id } = parsed.data;

  // 3. Verify user capability
  await requireCapability('bar.write', unit_id);

  // 4. Run core logic
  const res = await createBarChitCore(user.id, parsed.data);

  if (res.ok) {
    // 5. Revalidate paths
    revalidatePath('/bar');
    revalidatePath('/inventory');
  }

  return res;
}

function parseChitId(input: { id: string }): string | null {
  const id = typeof input?.id === 'string' ? input.id.trim() : '';
  return id.length > 0 ? id : null;
}

export async function finalizeBarChitAction(input: {
  id: string;
}): Promise<ActionResult> {
  const id = parseChitId(input);
  if (!id) return { error: 'Chit id is required' };

  const db = await getDb();
  const chitsCol = db.collection('bar_chits');
  const chit = await chitsCol.findOne({ id });

  if (!chit) return { error: 'Bar chit not found' };

  const user = await requireUser();
  await requireCapability('bar.finalize', chit.unit_id);

  if (chit.status !== 'pending') {
    return { error: 'Only pending chits can be finalized' };
  }

  const now = new Date().toISOString();
  await chitsCol.updateOne(
    { id: chit.id, status: 'pending' },
    { $set: { status: 'finalized', updated_at: now } },
  );

  await writeAudit({
    table_name: 'bar_chits',
    row_pk: chit.id,
    op: 'UPDATE',
    changed_by: user.id,
    active_unit_id: chit.unit_id,
    old_data: chit,
    new_data: { ...chit, status: 'finalized', updated_at: now },
  });

  revalidatePath('/bar');
  return { ok: true, id: chit.id };
}

/** Reopens a finalized chit if its billing period is not yet published. */
export async function reopenBarChitAction(input: {
  id: string;
}): Promise<ActionResult> {
  const id = parseChitId(input);
  if (!id) return { error: 'Chit id is required' };

  const db = await getDb();
  const chitsCol = db.collection('bar_chits');
  const chit = await chitsCol.findOne({ id });

  if (!chit) return { error: 'Bar chit not found' };

  const user = await requireUser();
  await requireCapability('bar.finalize', chit.unit_id);

  if (chit.status !== 'finalized') {
    return { error: 'Only finalized chits can be reopened' };
  }

  const publishedPeriod = await db.collection('mess_billing_periods').findOne({
    unit_id: chit.unit_id,
    status: { $in: ['published', 'closed'] },
    start_date: { $lte: chit.date },
    end_date: { $gte: chit.date },
  });

  if (publishedPeriod) {
    return { error: 'Cannot reopen a chit after the billing period has been published' };
  }

  const now = new Date().toISOString();
  await chitsCol.updateOne(
    { id: chit.id, status: 'finalized' },
    { $set: { status: 'pending', updated_at: now } },
  );

  await writeAudit({
    table_name: 'bar_chits',
    row_pk: chit.id,
    op: 'UPDATE',
    changed_by: user.id,
    active_unit_id: chit.unit_id,
    old_data: chit,
    new_data: { ...chit, status: 'pending', updated_at: now },
  });

  revalidatePath('/bar');
  return { ok: true, id: chit.id };
}
