'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
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
  CreateBillItemInput
} from '@/lib/schemas/guest-rooms';
import { Database } from '@/lib/supabase/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Booking, Room } from './types';

type Sb = SupabaseClient<Database>;

const GUEST_ROOMS_PATH = '/guest-rooms';

const UNIQUE_VIOLATION = '23505';

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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('unit_furniture')
    .insert(parsed.data)
    .select('*')
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { error: 'A furniture item with that name already exists in this unit.' };
    }
    return { error: error.message };
  }

  revalidatePath(GUEST_ROOMS_PATH);
  return { ok: true, data };
}

// --- Room Actions ---

export async function createRoomAction(input: unknown) {
  const parsed = createRoomSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  await requireCapability('rooms.manage', parsed.data.unit_id);

  const supabase = await createClient();
  const { inventory, ...roomFields } = parsed.data;

  const { data: newRoom, error } = await supabase
    .from('rooms')
    .insert(roomFields)
    .select('id')
    .single();

  if (error) return { error: error.message };

  if (inventory && inventory.length > 0) {
    const rows = inventory.map((row) => ({
      room_id: newRoom.id,
      furniture_id: row.furniture_id,
      quantity: row.quantity,
      condition: row.condition,
      notes: row.notes ?? null,
    }));

    const { error: invError } = await supabase.from('room_furniture').insert(rows);
    if (invError) return { error: invError.message };
  }

  revalidatePath(GUEST_ROOMS_PATH);
  return changedRoom(parsed.data.unit_id, newRoom.id);
}

export async function updateRoomAction(id: string, input: unknown) {
  const parsed = updateRoomSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  const supabase = await createClient();
  const { data: existing } = await supabase.from('rooms').select('unit_id').eq('id', id).single();
  if (!existing) return { error: 'Room not found' };

  await requireCapability('rooms.manage', existing.unit_id);

  const { inventory, ...roomFields } = parsed.data;

  const { error } = await supabase
    .from('rooms')
    .update(roomFields)
    .eq('id', id);

  if (error) return { error: error.message };

  if (inventory) {
    const { data: existingRows, error: readError } = await supabase
      .from('room_furniture')
      .select('id, furniture_id')
      .eq('room_id', id);

    if (readError) return { error: readError.message };

    const incomingIds = new Set(inventory.map((row) => row.furniture_id));
    const toDelete = (existingRows ?? []).filter((row) => !incomingIds.has(row.furniture_id));

    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('room_furniture')
        .delete()
        .in('id', toDelete.map((row) => row.id));

      if (deleteError) return { error: deleteError.message };
    }

    if (inventory.length > 0) {
      const rows = inventory.map((row) => ({
        room_id: id,
        furniture_id: row.furniture_id,
        quantity: row.quantity,
        condition: row.condition,
        notes: row.notes ?? null,
      }));

      const { error: upsertError } = await supabase
        .from('room_furniture')
        .upsert(rows, { onConflict: 'room_id,furniture_id' });

      if (upsertError) return { error: upsertError.message };
    }
  }

  revalidatePath(GUEST_ROOMS_PATH);
  return changedRoom(existing.unit_id, id);
}

// --- Booking Actions ---

async function isRoomAvailable(supabase: Sb, roomId: string, checkIn: string, checkOut: string, excludeBookingId?: string) {
  let q = supabase
    .from('bookings')
    .select('id')
    .eq('room_id', roomId)
    .neq('status', 'cancelled')
    .lt('check_in_date', checkOut)
    .gt('check_out_date', checkIn);
  
  if (excludeBookingId) {
    q = q.neq('id', excludeBookingId);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data?.length ?? 0) === 0;
}

export async function createBookingAction(input: CreateBookingInput) {
  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  await requireCapability('rooms.booking.write', parsed.data.unit_id);

  const supabase = await createClient();
  
  const available = await isRoomAvailable(supabase, parsed.data.room_id, parsed.data.check_in_date, parsed.data.check_out_date);
  if (!available) return { error: 'Room is not available for the selected dates' };

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      ...parsed.data,
      created_by: (await supabase.auth.getUser()).data.user?.id
    })
    .select('id, room_id')
    .single();

  if (error) return { error: error.message };

  revalidatePath(GUEST_ROOMS_PATH);
  return changedBooking(data.id, [data.room_id]);
}

type BookingWithRoom = Database['public']['Tables']['bookings']['Row'] & {
  room: { room_type: string; nightly_rate: number } | null;
};

export async function checkInAction(bookingId: string) {
  const supabase = await createClient();
  const { data, error: fetchErr } = await supabase
    .from('bookings')
    .select('*, room:rooms(room_type, nightly_rate)')
    .eq('id', bookingId)
    .single();

  if (fetchErr || !data) return { error: 'Booking not found' };
  
  const booking = data as unknown as BookingWithRoom;
  await requireCapability('rooms.booking.write', booking.unit_id);

  if (booking.status !== 'confirmed') return { error: 'Only confirmed bookings can be checked in' };

  // 1. Update booking status
  const { error: updErr } = await supabase
    .from('bookings')
    .update({
      status: 'checked_in',
      actual_check_in: new Date().toISOString()
    })
    .eq('id', bookingId);

  if (updErr) return { error: updErr.message };

  // 2. Create draft bill
  const { data: bill, error: billErr } = await supabase
    .from('room_bills')
    .insert({
      unit_id: booking.unit_id,
      booking_id: bookingId,
      status: 'draft'
    })
    .select('id')
    .single();

  if (billErr) return { error: billErr.message };

  // 3. Add room rent item
  if (booking.room) {
    // Calculate nights
    const nights = Math.max(1, Math.ceil((new Date(booking.check_out_date).getTime() - new Date(booking.check_in_date).getTime()) / (1000 * 60 * 60 * 24)));
    
    await supabase.from('room_bill_items').insert({
      bill_id: bill.id,
      category: 'room_rent',
      description: `Room Rent - ${booking.room.room_type} (${nights} nights)`,
      amount: Number(booking.room.nightly_rate),
      quantity: nights,
      variant_id: null
    });

    // Add default food bill item (900 per day)
    await supabase.from('room_bill_items').insert({
      bill_id: bill.id,
      category: 'food',
      description: `Food Bill (all meals) (${nights} days)`,
      amount: 900,
      quantity: nights,
      variant_id: null,
      meal_type: null
    });
  }

  revalidatePath(GUEST_ROOMS_PATH);
  return changedBooking(bookingId, [booking.room_id]);
}

export async function addBillItemAction(billId: string, input: CreateBillItemInput) {
  const parsed = createBillItemSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  const supabase = await createClient();
  const { data: bill } = await supabase
    .from('room_bills')
    .select('unit_id, status, booking_id')
    .eq('id', billId)
    .single();
  if (!bill) return { error: 'Bill not found' };
  if (bill.status !== 'draft') return { error: 'Cannot add items to a finalized bill' };

  await requireCapability('rooms.booking.write', bill.unit_id);

  const { error } = await supabase.from('room_bill_items').insert({
    bill_id: billId,
    ...parsed.data
  });

  if (error) return { error: error.message };

  revalidatePath(GUEST_ROOMS_PATH);
  return { ok: true, bookingId: bill.booking_id };
}

export async function createBillOrderAction(input: unknown) {
  const parsed = createBillOrderSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid input', details: parsed.error.flatten() };

  // Peek the bill (RLS-gated) to discover the unit, then verify the
  // capability explicitly so the failure mode is a clean 403.
  const supabase = await createClient();
  const { data: bill } = await supabase
    .from('room_bills')
    .select('unit_id, status, booking_id')
    .eq('id', parsed.data.bill_id)
    .maybeSingle();
  if (!bill) return { error: 'Bill not found' };

  await requireCapability('rooms.booking.write', bill.unit_id);

  if (bill.status !== 'draft') return { error: 'Cannot modify a finalized bill' };

  // Omit undefined occurred_at so the DB default applies.
  const { occurred_at, ...rest } = parsed.data;
  const insertRow = occurred_at === undefined ? rest : { ...rest, occurred_at };

  const { data, error } = await supabase
    .from('room_bill_orders')
    .insert(insertRow)
    .select('id')
    .single();

  if (error) return { error: error.message };

  revalidatePath(GUEST_ROOMS_PATH);
  return { ok: true, data: data.id, bookingId: bill.booking_id };
}

type BillItemWithBill = {
  id: string;
  bill: { unit_id: string; status: string; booking_id: string } | null;
};

export async function deleteBillItemAction(itemId: string) {
  const supabase = await createClient();
  const { data: peek } = await supabase
    .from('room_bill_items')
    .select('id, bill:room_bills(unit_id, status, booking_id)')
    .eq('id', itemId)
    .maybeSingle();
  if (!peek) return { error: 'Item not found' };

  const row = peek as unknown as BillItemWithBill;
  if (!row.bill) return { error: 'Item not found' };

  await requireCapability('rooms.booking.write', row.bill.unit_id);

  if (row.bill.status !== 'draft') return { error: 'Cannot modify a finalized bill' };

  const { error } = await supabase.from('room_bill_items').delete().eq('id', itemId);
  if (error) return { error: error.message };

  revalidatePath(GUEST_ROOMS_PATH);
  return { ok: true, bookingId: row.bill.booking_id };
}

type BillOrderWithBill = {
  id: string;
  bill: { unit_id: string; status: string; booking_id: string } | null;
};

export async function deleteBillOrderAction(orderId: string) {
  const supabase = await createClient();
  const { data: peek } = await supabase
    .from('room_bill_orders')
    .select('id, bill:room_bills(unit_id, status, booking_id)')
    .eq('id', orderId)
    .maybeSingle();
  if (!peek) return { error: 'Order not found' };

  const row = peek as unknown as BillOrderWithBill;
  if (!row.bill) return { error: 'Order not found' };

  await requireCapability('rooms.booking.write', row.bill.unit_id);

  if (row.bill.status !== 'draft') return { error: 'Cannot modify a finalized bill' };

  // Child bill items have an ON DELETE CASCADE FK to the order, so
  // deleting the order row removes its items too.
  const { error } = await supabase.from('room_bill_orders').delete().eq('id', orderId);
  if (error) return { error: error.message };

  revalidatePath(GUEST_ROOMS_PATH);
  return { ok: true, bookingId: row.bill.booking_id };
}

type BookingWithBillItems = Database['public']['Tables']['bookings']['Row'] & {
  bill: { id: string, items: { amount: number, quantity: number }[] }[];
};

export async function checkOutAction(bookingId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('bookings')
    .select('*, bill:room_bills(id, items:room_bill_items(amount, quantity))')
    .eq('id', bookingId)
    .single();

  if (!data) return { error: 'Booking not found' };
  
  const booking = data as unknown as BookingWithBillItems;
  await requireCapability('rooms.booking.write', booking.unit_id);

  if (booking.status !== 'checked_in') return { error: 'Only checked-in bookings can be checked out' };

  const bill = booking.bill?.[0];
  if (!bill) return { error: 'Bill not found' };

  // Calculate total
  const total = bill.items.reduce((sum: number, item: { amount: number; quantity: number }) => sum + (Number(item.amount) * Number(item.quantity)), 0);

  // 1. Update booking status
  await supabase.from('bookings').update({
    status: 'checked_out',
    actual_check_out: new Date().toISOString()
  }).eq('id', bookingId);

  // 2. Finalize bill
  await supabase.from('room_bills').update({
    status: 'finalized',
    total_amount: total,
    updated_at: new Date().toISOString()
  }).eq('id', bill.id);

  revalidatePath(GUEST_ROOMS_PATH);
  return changedBooking(bookingId, [booking.room_id]);
}

export async function cancelBookingAction(bookingId: string) {
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from('bookings')
    .select('unit_id, room_id, status')
    .eq('id', bookingId)
    .single();
  if (!booking) return { error: 'Booking not found' };
  await requireCapability('rooms.booking.write', booking.unit_id);

  if (booking.status !== 'confirmed') return { error: 'Only confirmed bookings can be cancelled' };

  const { error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', bookingId);

  if (error) return { error: error.message };

  revalidatePath(GUEST_ROOMS_PATH);
  return changedBooking(bookingId, [booking.room_id]);
}

export async function undoCheckInAction(bookingId: string) {
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from('bookings')
    .select('unit_id, room_id, status')
    .eq('id', bookingId)
    .single();

  if (!booking) return { error: 'Booking not found' };
  await requireCapability('rooms.booking.write', booking.unit_id);

  if (booking.status !== 'checked_in') return { error: 'Only checked-in bookings can be reverted' };

  const { error: updErr } = await supabase
    .from('bookings')
    .update({
      status: 'confirmed',
      actual_check_in: null
    })
    .eq('id', bookingId);

  if (updErr) return { error: updErr.message };

  const { error: billErr } = await supabase
    .from('room_bills')
    .delete()
    .eq('booking_id', bookingId);

  if (billErr) return { error: billErr.message };

  revalidatePath(GUEST_ROOMS_PATH);
  return changedBooking(bookingId, [booking.room_id]);
}

export async function undoCheckOutAction(bookingId: string) {
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from('bookings')
    .select('unit_id, room_id, status')
    .eq('id', bookingId)
    .single();

  if (!booking) return { error: 'Booking not found' };
  await requireCapability('rooms.booking.write', booking.unit_id);

  if (booking.status !== 'checked_out') return { error: 'Only checked-out bookings can be reverted' };

  const { error: updErr } = await supabase
    .from('bookings')
    .update({
      status: 'checked_in',
      actual_check_out: null
    })
    .eq('id', bookingId);

  if (updErr) return { error: updErr.message };

  const { error: billErr } = await supabase
    .from('room_bills')
    .update({
      status: 'draft',
      total_amount: 0,
      updated_at: new Date().toISOString()
    })
    .eq('booking_id', bookingId);

  if (billErr) return { error: billErr.message };

  revalidatePath(GUEST_ROOMS_PATH);
  return changedBooking(bookingId, [booking.room_id]);
}

export async function updateStayAndRatesAction(
  billId: string,
  input: {
    checkIn: string;
    checkOut: string;
    nightlyRate: number;
    foodRate: number;
  }
) {
  const supabase = await createClient();
  
  // 1. Fetch bill and associated booking and room details
  const { data: bill, error: billErr } = await supabase
    .from('room_bills')
    .select('*, booking:bookings(*, room:rooms(*))')
    .eq('id', billId)
    .single();

  if (billErr || !bill) return { error: 'Bill not found' };
  
  const booking = bill.booking;
  if (!booking) return { error: 'Associated booking not found' };
  
  // 2. Validate capability
  await requireCapability('rooms.booking.write', bill.unit_id);
  
  // 3. Ensure bill is draft
  if (bill.status !== 'draft') return { error: 'Stay and rates can only be edited for draft bills' };

  // 4. Calculate stay nights
  const nights = Math.max(1, Math.ceil((new Date(input.checkOut).getTime() - new Date(input.checkIn).getTime()) / (1000 * 60 * 60 * 24)));

  // 5. Update the booking dates
  const { error: bookingErr } = await supabase
    .from('bookings')
    .update({
      check_in_date: input.checkIn,
      check_out_date: input.checkOut,
      updated_at: new Date().toISOString()
    })
    .eq('id', booking.id);

  if (bookingErr) return { error: bookingErr.message };

  // 6. Recalculate/Upsert Room Rent item
  const { data: existingRent } = await supabase
    .from('room_bill_items')
    .select('id')
    .eq('bill_id', billId)
    .eq('category', 'room_rent')
    .maybeSingle();

  const rentRow = {
    bill_id: billId,
    category: 'room_rent',
    description: `Room Rent - ${booking.room?.room_type || 'Stay'} (${nights} nights)`,
    amount: input.nightlyRate,
    quantity: nights,
    variant_id: null
  };

  if (existingRent) {
    await supabase.from('room_bill_items').update(rentRow).eq('id', existingRent.id);
  } else {
    await supabase.from('room_bill_items').insert(rentRow);
  }

  // 7. Recalculate/Upsert Food Bill item
  const { data: existingFood } = await supabase
    .from('room_bill_items')
    .select('id')
    .eq('bill_id', billId)
    .eq('category', 'food')
    .is('meal_type', null)
    .maybeSingle();

  const foodRow = {
    bill_id: billId,
    category: 'food',
    description: `Food Bill (all meals) (${nights} days)`,
    amount: input.foodRate,
    quantity: nights,
    variant_id: null,
    meal_type: null
  };

  if (existingFood) {
    await supabase.from('room_bill_items').update(foodRow).eq('id', existingFood.id);
  } else {
    await supabase.from('room_bill_items').insert(foodRow);
  }

  revalidatePath(GUEST_ROOMS_PATH);
  return { ok: true, bookingId: booking.id };
}

export async function fetchAvailableRoomsAction(unitId: string, checkIn: string, checkOut: string) {
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

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('bookings')
    .select('unit_id, room_id, check_in_date, check_out_date')
    .eq('id', id)
    .single();
  if (!existing) return { error: 'Booking not found' };

  await requireCapability('rooms.booking.write', existing.unit_id);

  const roomId = parsed.data.room_id ?? existing.room_id;
  const checkIn = parsed.data.check_in_date ?? existing.check_in_date;
  const checkOut = parsed.data.check_out_date ?? existing.check_out_date;

  if (
    roomId !== existing.room_id ||
    checkIn !== existing.check_in_date ||
    checkOut !== existing.check_out_date
  ) {
    const available = await isRoomAvailable(supabase, roomId, checkIn, checkOut, id);
    if (!available) return { error: 'Room is not available for the selected dates' };
  }

  const { error } = await supabase
    .from('bookings')
    .update(parsed.data)
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath(GUEST_ROOMS_PATH);
  return changedBooking(id, [existing.room_id, roomId]);
}

export async function deleteBookingAction(bookingId: string) {
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from('bookings')
    .select('unit_id, room_id')
    .eq('id', bookingId)
    .single();
  if (!booking) return { error: 'Booking not found' };
  await requireCapability('rooms.booking.write', booking.unit_id);

  // 1. Get any bills associated with this booking
  const { data: bills } = await supabase.from('room_bills').select('id').eq('booking_id', bookingId);
  const billIds = bills?.map(b => b.id) || [];

  if (billIds.length > 0) {
    // Delete room bill items for these bills
    await supabase.from('room_bill_items').delete().in('bill_id', billIds);
    // Delete room bill orders for these bills
    await supabase.from('room_bill_orders').delete().in('bill_id', billIds);
    // Delete the bills themselves
    await supabase.from('room_bills').delete().in('id', billIds);
  }

  // 2. Delete the booking
  const { error } = await supabase.from('bookings').delete().eq('id', bookingId);
  if (error) return { error: error.message };

  revalidatePath(GUEST_ROOMS_PATH);
  return {
    ok: true,
    deletedBookingId: bookingId,
    affectedRoomIds: [booking.room_id],
  };
}

export async function fetchBookingWithBillAction(id: string) {
  // We don't know the booking's unit_id until we read it; do an
  // RLS-gated peek first (returns null for bookings the caller can't
  // see), then verify the capability for that unit explicitly so the
  // failure mode is a clean 403 rather than a silent "no rows".
  const supabase = await createClient();
  const { data: peek, error: peekErr } = await supabase
    .from('bookings')
    .select('unit_id')
    .eq('id', id)
    .maybeSingle();
  if (peekErr) return { error: peekErr.message };
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
  // Peek the room's unit (RLS-gated) then verify rooms.read explicitly so
  // the failure mode is a clean 403, not a silent empty list.
  const supabase = await createClient();
  const { data: peek, error: peekErr } = await supabase
    .from('rooms')
    .select('unit_id')
    .eq('id', roomId)
    .maybeSingle();
  if (peekErr) return { error: peekErr.message };
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

export async function fetchDailyBookingStatsAction(
  unitId: string,
  from: string,
  to: string,
) {
  await requireCapability('rooms.read', unitId);
  const { getDailyBookingStats } = await import('./queries');
  try {
    const stats = await getDailyBookingStats(unitId, from, to);
    return { data: stats };
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
  quantity: number
) {
  const supabase = await createClient();
  const { data: peek } = await supabase
    .from('room_bill_items')
    .select('id, bill:room_bills(unit_id, status, booking_id)')
    .eq('id', itemId)
    .maybeSingle();

  if (!peek) return { error: 'Item not found' };
  
  const row = peek as unknown as BillItemWithBill;
  if (!row.bill) return { error: 'Item not found' };
  if (row.bill.status !== 'draft') return { error: 'Cannot modify a finalized bill' };

  await requireCapability('rooms.booking.write', row.bill.unit_id);

  const { error } = await supabase
    .from('room_bill_items')
    .update({
      amount: amount,
      quantity: quantity
    })
    .eq('id', itemId);

  if (error) return { error: error.message };

  revalidatePath(GUEST_ROOMS_PATH);
  return { ok: true, bookingId: row.bill.booking_id };
}
