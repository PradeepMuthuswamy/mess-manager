'use server';

import { revalidatePath } from 'next/cache';
import type { ClientSession, Filter, Document } from 'mongodb';
import { getDb, getCollection, getMongoClient } from '@/lib/mongo';
import { requireCapability } from '@/lib/auth/require-capability';
import {
  createRoomSchema,
  updateRoomSchema,
  createBookingSchema,
  updateBookingSchema,
  createBillItemSchema,
  createBillOrderSchema,
  createFurnitureItemSchema,
  CreateBookingInput,
  UpdateBookingInput,
  CreateBillItemInput,
  checkOutBookingSchema,
  CheckOutBookingInput,
} from '@/lib/schemas/guest-rooms';
import type { Booking, Room } from './types';

const GUEST_ROOMS_PATH = '/guest-rooms';

async function runInTransactionOrFallback(
  fn: (session?: ClientSession) => Promise<void>,
): Promise<void> {
  const client = await getMongoClient();
  let session: ClientSession | undefined;
  try {
    session = client.startSession();
    try {
      await session.withTransaction(async () => {
        await fn(session);
      });
      return;
    } catch (txnError: unknown) {
      if (
        txnError?.message?.includes('replica set') ||
        txnError?.message?.includes('Transaction numbers')
      ) {
        await fn();
        return;
      }
      throw txnError;
    }
  } catch (err: unknown) {
    if (
      err?.message?.includes('replica set') ||
      err?.message?.includes('Transaction numbers') ||
      !session
    ) {
      await fn();
      return;
    }
    throw err;
  } finally {
    if (session) {
      await session.endSession().catch(() => {});
    }
  }
}

async function changedBooking(
  bookingId: string,
  affectedRoomIds: string[],
): Promise<{ ok: true; data: Booking; affectedRoomIds: string[] } | { error: string }> {
  const { getBookingSummaryById } = await import('./queries');
  try {
    const data = await getBookingSummaryById(bookingId);
    return { ok: true, data, affectedRoomIds: [...new Set(affectedRoomIds)] };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to load booking',
    };
  }
}

async function changedRoom(
  unitId: string,
  roomId: string,
): Promise<{ ok: true; data: Room } | { error: string }> {
  const { getRoomsByIds } = await import('./queries');
  try {
    const [data] = await getRoomsByIds(unitId, [roomId]);
    if (!data) return { error: 'Room not found' };
    return { ok: true, data };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to load room',
    };
  }
}

// --- Furniture Catalogue Actions ---

export async function createFurnitureItemAction(input: unknown) {
  const parsed = createFurnitureItemSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  await requireCapability('rooms.manage', parsed.data.unit_id);

  const col = await getCollection('unit_furniture');
  const existing = await col.findOne({
    unit_id: parsed.data.unit_id,
    name: {
      $regex: new RegExp(`^${parsed.data.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    },
  });

  if (existing) {
    return { error: 'A furniture item with that name already exists in this unit.' };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const doc = {
    id,
    unit_id: parsed.data.unit_id,
    name: parsed.data.name,
    kind: parsed.data.kind || 'furniture',
    created_at: now,
    updated_at: now,
  };

  await col.insertOne(doc);

  revalidatePath(GUEST_ROOMS_PATH);
  return { ok: true, data: doc };
}

// --- Room Actions ---

export async function createRoomAction(input: unknown) {
  const parsed = createRoomSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  await requireCapability('rooms.manage', parsed.data.unit_id);

  const roomsCol = await getCollection('rooms');
  const existing = await roomsCol.findOne({
    unit_id: parsed.data.unit_id,
    name: {
      $regex: new RegExp(`^${parsed.data.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    },
  });

  if (existing) {
    return { error: 'A room with that name already exists in this unit.' };
  }

  const { inventory, ...roomFields } = parsed.data;
  const roomId = crypto.randomUUID();
  const now = new Date().toISOString();

  const newRoomDoc = {
    id: roomId,
    unit_id: parsed.data.unit_id,
    name: roomFields.name,
    room_type: roomFields.room_type || 'Standard',
    nightly_rate: Number(roomFields.nightly_rate || 0),
    status: roomFields.status || 'available',
    created_at: now,
    updated_at: now,
  };

  await roomsCol.insertOne(newRoomDoc);

  if (inventory && inventory.length > 0) {
    const furnitureCol = await getCollection('room_furniture');
    const rows = inventory.map((row) => ({
      id: crypto.randomUUID(),
      room_id: roomId,
      furniture_id: row.furniture_id,
      quantity: row.quantity,
      condition: row.condition,
      notes: row.notes ?? null,
      created_at: now,
      updated_at: now,
    }));

    await furnitureCol.insertMany(rows);
  }

  revalidatePath(GUEST_ROOMS_PATH);
  return changedRoom(parsed.data.unit_id, roomId);
}

export async function updateRoomAction(id: string, input: unknown) {
  const parsed = updateRoomSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  const roomsCol = await getCollection('rooms');
  const existing = await roomsCol.findOne({ id });
  if (!existing) return { error: 'Room not found' };

  await requireCapability('rooms.manage', existing.unit_id);

  const { inventory, ...roomFields } = parsed.data;
  const now = new Date().toISOString();

  if (roomFields.name && roomFields.name !== existing.name) {
    const dup = await roomsCol.findOne({
      unit_id: existing.unit_id,
      id: { $ne: id },
      name: {
        $regex: new RegExp(`^${roomFields.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      },
    });
    if (dup) {
      return { error: 'A room with that name already exists in this unit.' };
    }
  }

  await roomsCol.updateOne(
    { id },
    {
      $set: {
        ...roomFields,
        ...(roomFields.nightly_rate != null ? { nightly_rate: Number(roomFields.nightly_rate) } : {}),
        updated_at: now,
      },
    },
  );

  if (inventory) {
    const roomFurnitureCol = await getCollection('room_furniture');
    const existingRows = await roomFurnitureCol.find({ room_id: id }).toArray();

    const incomingIds = new Set(inventory.map((row) => row.furniture_id));
    const toDelete = (existingRows ?? []).filter((row: Document) => !incomingIds.has(row.furniture_id));

    if (toDelete.length > 0) {
      await roomFurnitureCol.deleteMany({
        id: { $in: toDelete.map((row: Document) => row.id) },
      });
    }

    if (inventory.length > 0) {
      for (const row of inventory) {
        await roomFurnitureCol.updateOne(
          { room_id: id, furniture_id: row.furniture_id },
          {
            $set: {
              quantity: row.quantity,
              condition: row.condition,
              notes: row.notes ?? null,
              updated_at: now,
            },
            $setOnInsert: {
              id: crypto.randomUUID(),
              created_at: now,
            },
          },
          { upsert: true },
        );
      }
    }
  }

  revalidatePath(GUEST_ROOMS_PATH);
  return changedRoom(existing.unit_id, id);
}

// --- Booking Actions ---

async function isRoomAvailable(
  roomId: string,
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string,
): Promise<boolean> {
  const bookingsCol = await getCollection('bookings');
  const query: Filter<Booking> = {
    room_id: roomId,
    status: { $ne: 'cancelled' },
    check_in_date: { $lt: checkOut },
    check_out_date: { $gt: checkIn },
  };

  if (excludeBookingId) {
    query.id = { $ne: excludeBookingId };
  }

  const count = await bookingsCol.countDocuments(query);
  return count === 0;
}

export async function createBookingAction(input: CreateBookingInput) {
  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  if (parsed.data.settlement_type === 'CHARGE_TO_HOST' && !parsed.data.host_profile_id) {
    return { error: 'A sponsoring host officer is required when charging to mess bill.' };
  }

  const user = await requireCapability('rooms.booking.write', parsed.data.unit_id);

  const roomsCol = await getCollection('rooms');
  const room = await roomsCol.findOne({
    id: parsed.data.room_id,
    unit_id: parsed.data.unit_id,
  });
  if (!room) return { error: 'Room not found in this unit' };

  const available = await isRoomAvailable(
    parsed.data.room_id,
    parsed.data.check_in_date,
    parsed.data.check_out_date,
  );
  if (!available) return { error: 'Room is not available for the selected dates' };

  const bookingsCol = await getCollection('bookings');
  const bookingId = crypto.randomUUID();
  const now = new Date().toISOString();

  const bookingDoc = {
    id: bookingId,
    unit_id: parsed.data.unit_id,
    room_id: parsed.data.room_id,
    guest_name: parsed.data.guest_name,
    guest_rank: parsed.data.guest_rank ?? null,
    guest_phone: parsed.data.guest_phone ?? null,
    guest_email: parsed.data.guest_email ?? null,
    check_in_date: parsed.data.check_in_date,
    check_out_date: parsed.data.check_out_date,
    status: parsed.data.status || 'confirmed',
    booking_category: parsed.data.booking_category || 'MEMBER_GUEST',
    host_profile_id: parsed.data.host_profile_id ?? null,
    settlement_type: parsed.data.settlement_type || 'DIRECT_SETTLEMENT',
    special_requests: parsed.data.special_requests ?? null,
    created_by: user.id,
    created_at: now,
    updated_at: now,
  };

  await bookingsCol.insertOne(bookingDoc);

  revalidatePath(GUEST_ROOMS_PATH);
  return changedBooking(bookingId, [parsed.data.room_id]);
}

/**
 * Atomic check-in operation directly using MongoDB transactions or atomic updates.
 * Updates booking status -> creates draft bill -> seeds initial tariff lines (rent + food).
 */
export async function executeCheckInBooking(bookingId: string): Promise<{
  booking_id: string;
  bill_id: string;
  room_id: string;
  unit_id: string;
}> {
  const db = await getDb();
  const bookingsCol = db.collection('bookings');
  const roomsCol = db.collection('rooms');
  const unitsCol = db.collection('units');
  const roomBillsCol = db.collection('room_bills');
  const roomBillItemsCol = db.collection('room_bill_items');

  const booking = await bookingsCol.findOne({ id: bookingId });
  if (!booking) throw new Error('Booking not found');
  if (booking.status !== 'confirmed') {
    throw new Error(`Only confirmed bookings can be checked in (current: ${booking.status})`);
  }

  const room = await roomsCol.findOne({ id: booking.room_id });
  if (!room) throw new Error('Room not found');

  const unit = await unitsCol.findOne({ id: booking.unit_id });
  const foodRate = Number(unit?.guest_food_per_night ?? 900);

  const checkIn = new Date(booking.check_in_date);
  const checkOut = new Date(booking.check_out_date);
  const nights = Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));

  const now = new Date().toISOString();
  const billId = crypto.randomUUID();

  await runInTransactionOrFallback(async (session) => {
    // 1. Flip booking status
    await bookingsCol.updateOne(
      { id: bookingId, status: 'confirmed' },
      {
        $set: {
          status: 'checked_in',
          actual_check_in: now,
          updated_at: now,
        },
      },
      { session },
    );

    // 2. Create draft bill
    const billDoc = {
      id: billId,
      unit_id: booking.unit_id,
      booking_id: bookingId,
      total_amount: 0,
      status: 'draft',
      payment_status: 'draft',
      settlement_type: booking.settlement_type || 'DIRECT_SETTLEMENT',
      paid_amount: 0,
      created_at: now,
      updated_at: now,
    };
    await roomBillsCol.insertOne(billDoc, { session });

    // 3. Seed tariff lines (room rent + food)
    const items = [
      {
        id: crypto.randomUUID(),
        bill_id: billId,
        category: 'room_rent',
        description: `Room Rent - ${room.room_type || 'Room'} (${nights} nights)`,
        amount: Number(room.nightly_rate || 0),
        quantity: nights,
        variant_id: null,
        created_at: now,
      },
      {
        id: crypto.randomUUID(),
        bill_id: billId,
        category: 'food',
        description: `Food Bill (all meals) (${nights} days)`,
        amount: foodRate,
        quantity: nights,
        variant_id: null,
        created_at: now,
      },
    ];
    await roomBillItemsCol.insertMany(items, { session });
  });

  return {
    booking_id: bookingId,
    bill_id: billId,
    room_id: booking.room_id,
    unit_id: booking.unit_id,
  };
}

export async function checkInAction(bookingId: string) {
  const bookingsCol = await getCollection('bookings');
  const peek = await bookingsCol.findOne({ id: bookingId });
  if (!peek) return { error: 'Booking not found' };

  await requireCapability('rooms.booking.write', peek.unit_id);

  try {
    await executeCheckInBooking(bookingId);
  } catch (error: unknown) {
    const msg = error?.message?.replace(/^[A-Z0-9]+:\s*/, '') || 'Check-in failed';
    return { error: msg };
  }

  revalidatePath(GUEST_ROOMS_PATH);
  return changedBooking(bookingId, [peek.room_id]);
}

export async function addBillItemAction(billId: string, input: CreateBillItemInput) {
  const parsed = createBillItemSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  const db = await getDb();
  const bill = await db.collection('room_bills').findOne({ id: billId });
  if (!bill) return { error: 'Bill not found' };
  if (bill.status !== 'draft') return { error: 'Cannot add items to a finalized bill' };

  await requireCapability('rooms.booking.write', bill.unit_id);

  if (parsed.data.order_id) {
    const order = await db
      .collection('room_bill_orders')
      .findOne({ id: parsed.data.order_id, bill_id: billId });
    if (!order) return { error: 'Order not found for this bill' };
  }

  const itemId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.collection('room_bill_items').insertOne({
    id: itemId,
    bill_id: billId,
    category: parsed.data.category,
    description: parsed.data.description,
    amount: Number(parsed.data.amount),
    quantity: Number(parsed.data.quantity || 1),
    variant_id: parsed.data.variant_id ?? null,
    meal_type: parsed.data.meal_type ?? null,
    order_id: parsed.data.order_id ?? null,
    created_at: now,
  });

  revalidatePath(GUEST_ROOMS_PATH);
  return { ok: true, bookingId: bill.booking_id };
}


export async function deleteBillItemAction(itemId: string) {
  const db = await getDb();
  const item = await db.collection('room_bill_items').findOne({ id: itemId });
  if (!item) return { error: 'Item not found' };

  const bill = await db.collection('room_bills').findOne({ id: item.bill_id });
  if (!bill) return { error: 'Item not found' };

  await requireCapability('rooms.booking.write', bill.unit_id);
  if (bill.status !== 'draft') return { error: 'Cannot modify a finalized bill' };

  await db.collection('room_bill_items').deleteOne({ id: itemId });

  revalidatePath(GUEST_ROOMS_PATH);
  return { ok: true, bookingId: bill.booking_id };
}


export async function syncBarChitsToRoomBillAction(bookingId: string) {
  const db = await getDb();
  const booking = await db.collection('bookings').findOne({ id: bookingId });
  if (!booking) return { error: 'Booking not found' };

  await requireCapability('rooms.booking.write', booking.unit_id);

  const bill = await db.collection('room_bills').findOne({ booking_id: bookingId });
  if (!bill) return { error: 'Bill not found' };
  if (bill.status !== 'draft') return { error: 'Cannot sync bar chits to a finalized bill' };

  const chits = await db.collection('bar_chits').find({ booking_id: bookingId }).toArray();
  const existingItems = await db
    .collection('room_bill_items')
    .find({ bill_id: bill.id, bar_chit_id: { $ne: null } })
    .toArray();

  const alreadySynced = new Set(
    existingItems.map((item: Document) => item.bar_chit_id).filter(Boolean),
  );

  const unSyncedChits = chits.filter((chit: Document) => !alreadySynced.has(chit.id));
  if (unSyncedChits.length === 0) {
    return { ok: true, bookingId, inserted: 0 };
  }

  const chitIds = unSyncedChits.map((c: Document) => c.id);
  const chitItems = await db
    .collection('bar_chit_items')
    .find({ chit_id: { $in: chitIds } })
    .toArray();
  const chitItemMap = new Map<string, Document>();
  for (const ci of chitItems) {
    if (!chitItemMap.has(ci.chit_id)) {
      chitItemMap.set(ci.chit_id, ci);
    }
  }

  const now = new Date().toISOString();
  const rows = unSyncedChits.map((chit: Document) => ({
    id: crypto.randomUUID(),
    bill_id: bill.id,
    category: 'bar',
    description: `Bar — ${chit.guest_name ?? 'Guest'} (${chit.date})`,
    amount: Number(chit.total_amount || 0),
    quantity: 1,
    variant_id: chitItemMap.get(chit.id)?.variant_id ?? null,
    bar_chit_id: chit.id,
    created_at: now,
  }));

  if (rows.length > 0) {
    await db.collection('room_bill_items').insertMany(rows);
  }

  revalidatePath(GUEST_ROOMS_PATH);
  return { ok: true, bookingId, inserted: rows.length };
}

/**
 * Atomic checkout operation directly using MongoDB transactions or atomic updates.
 * Updates booking status to checked_out -> computes total amount from items -> finalizes bill.
 */
export async function executeFinalizeCheckout(params: {
  bookingId: string;
  settlementType: 'DIRECT_SETTLEMENT' | 'CHARGE_TO_HOST';
  hostProfileId?: string | null;
  folioNumber?: string | null;
  paidAmount?: number | null;
  paymentMethod?: string | null;
  paymentRef?: string | null;
}): Promise<{
  booking_id: string;
  bill_id: string;
  room_id: string;
  unit_id: string;
  total: number;
}> {
  const db = await getDb();
  const bookingsCol = db.collection('bookings');
  const roomBillsCol = db.collection('room_bills');
  const roomBillItemsCol = db.collection('room_bill_items');

  const booking = await bookingsCol.findOne({ id: params.bookingId });
  if (!booking) throw new Error('Booking not found');
  if (booking.status !== 'checked_in') {
    throw new Error(`Only checked-in bookings can be checked out (current: ${booking.status})`);
  }

  const effectiveHost = params.hostProfileId || booking.host_profile_id;
  if (params.settlementType === 'CHARGE_TO_HOST' && !effectiveHost) {
    throw new Error('Cannot transfer bill to mess account: No sponsoring host officer assigned');
  }

  const bill = await roomBillsCol.findOne({ booking_id: params.bookingId });
  if (!bill) throw new Error('Bill not found');

  const items = await roomBillItemsCol.find({ bill_id: bill.id }).toArray();
  const total = items.reduce(
    (sum, item: Document) => sum + Number(item.amount || 0) * Number(item.quantity || 1),
    0,
  );

  const isDirect = params.settlementType === 'DIRECT_SETTLEMENT';
  const now = new Date().toISOString();

  await runInTransactionOrFallback(async (session) => {
    // 1. Update booking
    await bookingsCol.updateOne(
      { id: params.bookingId, status: 'checked_in' },
      {
        $set: {
          status: 'checked_out',
          actual_check_out: now,
          settlement_type: params.settlementType,
          host_profile_id: effectiveHost ?? null,
          updated_at: now,
        },
      },
      { session },
    );

    // 2. Finalize bill
    await roomBillsCol.updateOne(
      { id: bill.id },
      {
        $set: {
          status: isDirect ? 'paid' : 'transferred_to_mess_bill',
          total_amount: total,
          settlement_type: params.settlementType,
          payment_status: isDirect ? 'paid' : 'transferred_to_mess_bill',
          paid_amount: isDirect ? (params.paidAmount ?? total) : 0,
          paid_at: isDirect ? now : null,
          payment_method: isDirect ? (params.paymentMethod || 'cash') : null,
          payment_reference: isDirect ? (params.paymentRef || null) : null,
          folio_number: params.folioNumber || null,
          updated_at: now,
        },
      },
      { session },
    );
  });

  return {
    booking_id: params.bookingId,
    bill_id: bill.id,
    room_id: booking.room_id,
    unit_id: booking.unit_id,
    total,
  };
}

export async function checkOutAction(input: string | CheckOutBookingInput) {
  const raw = typeof input === 'string' ? { booking_id: input } : input;
  const parsed = checkOutBookingSchema.safeParse(raw);
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  const options = parsed.data;
  const bookingId = options.booking_id;
  const settlementExplicit = typeof input !== 'string' && input.settlement_type != null;

  const db = await getDb();
  const booking = await db.collection('bookings').findOne({ id: bookingId });
  if (!booking) return { error: 'Booking not found' };

  await requireCapability('rooms.booking.write', booking.unit_id);
  if (booking.status !== 'checked_in') {
    return { error: 'Only checked-in bookings can be checked out' };
  }

  const bill = await db.collection('room_bills').findOne({ booking_id: bookingId });
  if (!bill) return { error: 'Bill not found' };

  const settlementType = settlementExplicit
    ? options.settlement_type
    : (booking.settlement_type ?? options.settlement_type);

  const hostId = options.host_profile_id ?? booking.host_profile_id;
  if (settlementType === 'CHARGE_TO_HOST' && !hostId) {
    return {
      error:
        'Cannot transfer bill to mess account: No sponsoring host officer is assigned to this booking.',
    };
  }

  const syncResult = await syncBarChitsToRoomBillAction(bookingId);
  if ('error' in syncResult) return { error: syncResult.error };

  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const folioSuffix = bill.id.replace(/-/g, '').slice(0, 6).toUpperCase();
  const folioNumber = `FOLIO-${yearMonth}-${folioSuffix}`;

  try {
    await executeFinalizeCheckout({
      bookingId,
      settlementType,
      hostProfileId: hostId ?? null,
      folioNumber,
      paidAmount: options.paid_amount ?? null,
      paymentMethod: options.payment_method ?? null,
      paymentRef: options.payment_reference ?? null,
    });
  } catch (err: unknown) {
    const msg = err?.message?.replace(/^[A-Z0-9]+:\s*/, '') || 'Check-out failed';
    return { error: msg };
  }

  revalidatePath(GUEST_ROOMS_PATH);
  return changedBooking(bookingId, [booking.room_id]);
}

export async function cancelBookingAction(bookingId: string) {
  const db = await getDb();
  const booking = await db.collection('bookings').findOne({ id: bookingId });
  if (!booking) return { error: 'Booking not found' };

  await requireCapability('rooms.booking.write', booking.unit_id);
  if (booking.status !== 'confirmed') return { error: 'Only confirmed bookings can be cancelled' };

  await db.collection('bookings').updateOne(
    { id: bookingId },
    { $set: { status: 'cancelled', updated_at: new Date().toISOString() } },
  );

  revalidatePath(GUEST_ROOMS_PATH);
  return changedBooking(bookingId, [booking.room_id]);
}

export async function undoCheckInAction(bookingId: string) {
  const db = await getDb();
  const booking = await db.collection('bookings').findOne({ id: bookingId });
  if (!booking) return { error: 'Booking not found' };

  await requireCapability('rooms.booking.write', booking.unit_id);
  if (booking.status !== 'checked_in') return { error: 'Only checked-in bookings can be reverted' };

  const now = new Date().toISOString();
  await db.collection('bookings').updateOne(
    { id: bookingId },
    {
      $set: {
        status: 'confirmed',
        actual_check_in: null,
        updated_at: now,
      },
    },
  );

  const bills = await db.collection('room_bills').find({ booking_id: bookingId }).toArray();
  const billIds = bills.map((b: Document) => b.id);
  if (billIds.length > 0) {
    await db.collection('room_bill_items').deleteMany({ bill_id: { $in: billIds } });
    await db.collection('room_bill_orders').deleteMany({ bill_id: { $in: billIds } });
    await db.collection('room_bills').deleteMany({ booking_id: bookingId });
  }

  revalidatePath(GUEST_ROOMS_PATH);
  return changedBooking(bookingId, [booking.room_id]);
}

export async function undoCheckOutAction(bookingId: string) {
  const db = await getDb();
  const booking = await db.collection('bookings').findOne({ id: bookingId });
  if (!booking) return { error: 'Booking not found' };

  await requireCapability('rooms.booking.write', booking.unit_id);
  if (booking.status !== 'checked_out') return { error: 'Only checked-out bookings can be reverted' };

  const now = new Date().toISOString();
  await db.collection('bookings').updateOne(
    { id: bookingId },
    {
      $set: {
        status: 'checked_in',
        actual_check_out: null,
        updated_at: now,
      },
    },
  );

  await db.collection('room_bills').updateOne(
    { booking_id: bookingId },
    {
      $set: {
        status: 'draft',
        total_amount: 0,
        payment_status: 'draft',
        folio_number: null,
        paid_amount: 0,
        paid_at: null,
        payment_method: null,
        payment_reference: null,
        updated_at: now,
      },
    },
  );

  revalidatePath(GUEST_ROOMS_PATH);
  return changedBooking(bookingId, [booking.room_id]);
}


export async function fetchAvailableRoomsAction(
  unitId: string,
  checkIn: string,
  checkOut: string,
) {
  await requireCapability('rooms.read', unitId);
  const { getAvailableRooms } = await import('./queries');
  try {
    const rooms = await getAvailableRooms(unitId, checkIn, checkOut);
    return { data: rooms };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function updateBookingAction(id: string, input: UpdateBookingInput) {
  const parsed = updateBookingSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  const db = await getDb();
  const existing = await db.collection('bookings').findOne({ id });
  if (!existing) return { error: 'Booking not found' };

  await requireCapability('rooms.booking.write', existing.unit_id);

  const settlementType = parsed.data.settlement_type ?? existing.settlement_type;
  const hostId = parsed.data.host_profile_id ?? existing.host_profile_id;
  if (settlementType === 'CHARGE_TO_HOST' && !hostId) {
    return { error: 'A sponsoring host officer is required when charging to mess bill.' };
  }

  const roomId = parsed.data.room_id ?? existing.room_id;
  const checkIn = parsed.data.check_in_date ?? existing.check_in_date;
  const checkOut = parsed.data.check_out_date ?? existing.check_out_date;

  if (
    roomId !== existing.room_id ||
    checkIn !== existing.check_in_date ||
    checkOut !== existing.check_out_date
  ) {
    const available = await isRoomAvailable(roomId, checkIn, checkOut, id);
    if (!available) return { error: 'Room is not available for the selected dates' };
  }

  const now = new Date().toISOString();
  await db.collection('bookings').updateOne(
    { id },
    {
      $set: {
        ...parsed.data,
        updated_at: now,
      },
    },
  );

  revalidatePath(GUEST_ROOMS_PATH);
  return changedBooking(id, [existing.room_id, roomId]);
}

export async function deleteBookingAction(bookingId: string) {
  const db = await getDb();
  const booking = await db.collection('bookings').findOne({ id: bookingId });
  if (!booking) return { error: 'Booking not found' };

  await requireCapability('rooms.booking.write', booking.unit_id);

  if (booking.status === 'checked_in' || booking.status === 'checked_out') {
    return {
      error:
        'Cannot delete a booking that has been checked in or out. Cancel it first, or use the undo action to revert the lifecycle step.',
    };
  }

  const bills = await db.collection('room_bills').find({ booking_id: bookingId }).toArray();
  const billIds = bills.map((b: Document) => b.id);

  if (billIds.length > 0) {
    await db.collection('room_bill_items').deleteMany({ bill_id: { $in: billIds } });
    await db.collection('room_bill_orders').deleteMany({ bill_id: { $in: billIds } });
    await db.collection('room_bills').deleteMany({ id: { $in: billIds } });
  }

  await db.collection('bookings').deleteOne({ id: bookingId });

  revalidatePath(GUEST_ROOMS_PATH);
  return {
    ok: true,
    deletedBookingId: bookingId,
    affectedRoomIds: [booking.room_id],
  };
}

export async function fetchBookingWithBillAction(id: string) {
  const db = await getDb();
  const peek = await db.collection('bookings').findOne({ id });
  if (!peek) return { error: 'Booking not found' };

  await requireCapability('rooms.read', peek.unit_id);

  const { getBookingById } = await import('./queries');
  try {
    const booking = await getBookingById(id);
    return { data: booking };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function fetchRoomInventoryAction(roomId: string) {
  const db = await getDb();
  const peek = await db.collection('rooms').findOne({ id: roomId });
  if (!peek) return { error: 'Room not found' };

  await requireCapability('rooms.read', peek.unit_id);

  const { getRoomInventory } = await import('./queries');
  try {
    const inventory = await getRoomInventory(roomId);
    return { data: inventory };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}


export async function fetchMonthBookingsAction(
  unitId: string,
  from: string,
  to: string,
) {
  await requireCapability('rooms.read', unitId);
  const { getBookings } = await import('./queries');
  try {
    const bookings = await getBookings(unitId, from, to);
    return { data: bookings };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function fetchRoomsAction(unitId: string) {
  await requireCapability('rooms.read', unitId);
  const { getRooms } = await import('./queries');
  try {
    const rooms = await getRooms(unitId);
    return { data: rooms };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function fetchRoomsByIdsAction(unitId: string, roomIds: string[]) {
  await requireCapability('rooms.read', unitId);
  const { getRoomsByIds } = await import('./queries');
  try {
    const rooms = await getRoomsByIds(unitId, roomIds);
    return { data: rooms };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function fetchUnitFurnitureAction(unitId: string) {
  await requireCapability('rooms.read', unitId);
  const { getUnitFurniture } = await import('./queries');
  try {
    const furniture = await getUnitFurniture(unitId);
    return { data: furniture };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function updateBillItemAction(
  itemId: string,
  amount: number,
  quantity: number,
) {
  const { updateBillItemSchema } = await import('@/lib/schemas/guest-rooms');
  const parsed = updateBillItemSchema.safeParse({ amount, quantity });
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  const db = await getDb();
  const item = await db.collection('room_bill_items').findOne({ id: itemId });
  if (!item) return { error: 'Item not found' };

  const bill = await db.collection('room_bills').findOne({ id: item.bill_id });
  if (!bill) return { error: 'Item not found' };
  if (bill.status !== 'draft') return { error: 'Cannot modify a finalized bill' };

  await requireCapability('rooms.booking.write', bill.unit_id);

  await db.collection('room_bill_items').updateOne(
    { id: itemId },
    {
      $set: {
        amount: parsed.data.amount,
        quantity: parsed.data.quantity,
      },
    },
  );

  revalidatePath(GUEST_ROOMS_PATH);
  return { ok: true, bookingId: bill.booking_id };
}

export async function fetchHostProfilesAction(unitId: string) {
  await requireCapability('rooms.read', unitId);
  const { listHostProfiles } = await import('./queries');
  try {
    const profiles = await listHostProfiles(unitId);
    return { data: profiles };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
