import 'server-only';
import { getDb, getCollection } from '@/lib/mongo';
import type { Document } from 'mongodb';

export type {
  Room,
  Booking,
  BookingWithBill,
  UnitFurniture,
  RoomFurniture,
  HostProfile,
  RoomBill,
  RoomBillItem,
  RoomBillSummary,
  RoomBillWithLines,
  RoomBillDetail,
  BillOrder,
  UnitGuestTariff,
} from './types';
import type {
  Room,
  Booking,
  BookingWithBill,
  UnitFurniture,
  RoomFurniture,
  HostProfile,
  RoomBill,
  RoomBillItem,
  RoomBillSummary,
  RoomBillWithLines,
  RoomBillDetail,
  BillOrder,
  UnitGuestTariff,
  RoomCurrentStatus,
} from './types';

function cleanDoc<T>(doc: Document): T;
function cleanDoc<T>(doc: Document | null | undefined): T | null;
function cleanDoc<T>(doc: Document | null | undefined): T | null {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { ...rest, id: rest.id || _id?.toString() } as unknown as T;
}

type RawBillLines = {
  items?: RoomBillItem[] | null;
  orders?: (Omit<BillOrder, 'items'> & { items?: RoomBillItem[] | null })[] | null;
};

/**
 * One consistent folio shape: each line appears once, including bar.
 * Keep standalone lines (`order_id` is null) on `items` and order lines nested.
 */
export function normalizeRoomBillLines<T extends RawBillLines>(
  raw: T,
): Omit<T, 'items' | 'orders'> & { items: RoomBillItem[]; orders: BillOrder[] } {
  const orders: BillOrder[] = (raw.orders ?? []).map((order) => ({
    ...order,
    items: (order.items ?? []).filter((item) => item.order_id === order.id),
  }));
  const nestedIds = new Set(
    orders.flatMap((order) => order.items.map((item) => item.id)),
  );
  const items = (raw.items ?? []).filter(
    (item) => item.order_id == null && !nestedIds.has(item.id),
  );

  return { ...raw, items, orders };
}

export async function getRooms(unitId: string, _client?: unknown): Promise<Room[]> {
  const db = await getDb();
  const roomsCol = db.collection('rooms');
  const bookingsCol = db.collection('bookings');

  const rawRooms = await roomsCol
    .find({ unit_id: unitId })
    .sort({ name: 1 })
    .toArray();

  const today = new Date().toISOString().split('T')[0];

  // Derive current_status and current_booking_id from active bookings
  const activeBookings = await bookingsCol
    .find({
      unit_id: unitId,
      status: { $in: ['checked_in', 'confirmed'] },
      check_in_date: { $lte: today },
      check_out_date: { $gt: today },
    })
    .toArray();

  const bookingByRoom = new Map<string, Document>();
  for (const b of activeBookings) {
    const existing = bookingByRoom.get(b.room_id);
    if (!existing || (existing.status !== 'checked_in' && b.status === 'checked_in')) {
      bookingByRoom.set(b.room_id, b);
    }
  }

  return rawRooms.map((r: Document) => {
    const room = cleanDoc<Room>(r);
    const booking = bookingByRoom.get(room.id);

    let current_status: RoomCurrentStatus = 'vacant';
    let current_booking_id: string | null = null;

    if (room.status === 'maintenance') {
      current_status = 'maintenance';
    } else if (room.status === 'out_of_service') {
      current_status = 'out_of_service';
    } else if (booking) {
      current_status = booking.status === 'checked_in' ? 'occupied' : 'reserved';
      current_booking_id = booking.id || booking._id?.toString() || null;
    }

    return {
      ...room,
      nightly_rate: Number(room.nightly_rate || 0),
      current_status,
      current_booking_id,
    };
  });
}

export async function getBookings(
  unitId: string,
  from: string,
  to: string,
  _client?: unknown,
): Promise<Booking[]> {
  const db = await getDb();
  const bookingsCol = db.collection('bookings');

  const rawBookings = await bookingsCol
    .find({
      unit_id: unitId,
      status: { $ne: 'cancelled' },
      check_out_date: { $gte: from },
      check_in_date: { $lte: to },
    })
    .sort({ check_in_date: 1 })
    .toArray();

  if (rawBookings.length === 0) return [];

  const roomIds = [...new Set(rawBookings.map((b: Document) => b.room_id).filter(Boolean))];
  const hostProfileIds = [
    ...new Set(rawBookings.map((b: Document) => b.host_profile_id).filter(Boolean)),
  ];
  const bookingIds = rawBookings.map((b: Document) => b.id || b._id?.toString());

  const [rooms, profiles, unitDoc, bills] = await Promise.all([
    roomIds.length > 0
      ? db
          .collection('rooms')
          .find({ id: { $in: roomIds } })
          .toArray()
      : Promise.resolve([]),
    hostProfileIds.length > 0
      ? db
          .collection('profiles')
          .find({ id: { $in: hostProfileIds } })
          .toArray()
      : Promise.resolve([]),
    db.collection('units').findOne({ id: unitId }),
    bookingIds.length > 0
      ? db
          .collection('room_bills')
          .find({ booking_id: { $in: bookingIds } })
          .toArray()
      : Promise.resolve([]),
  ]);

  const roomMap = new Map<string, Document>(rooms.map((r: Document) => [r.id, r]));
  const hostMap = new Map<string, HostProfile>(
    profiles.map((p: Document) => [
      p.id,
      {
        id: p.id,
        full_name: p.full_name ?? null,
        rank: p.rank ?? null,
        service_no: p.service_no ?? null,
      },
    ]),
  );
  const billMap = new Map<string, RoomBillSummary>(
    bills.map((b: Document) => [
      b.booking_id,
      {
        id: b.id || b._id?.toString(),
        status: b.status,
        payment_status: b.payment_status,
        folio_number: b.folio_number ?? null,
        settlement_type: b.settlement_type,
        total_amount: Number(b.total_amount || 0),
      },
    ]),
  );

  const unitTariff: UnitGuestTariff = {
    guest_food_per_night: Number(unitDoc?.guest_food_per_night ?? 900),
  };

  return rawBookings.map((b: Document) => {
    const booking = cleanDoc<Booking>(b);
    return {
      ...booking,
      room: {
        name: roomMap.get(booking.room_id)?.name ?? 'Unknown Room',
      },
      host_profile: booking.host_profile_id
        ? hostMap.get(booking.host_profile_id) ?? null
        : null,
      unit: unitTariff,
      bill: billMap.get(booking.id) ?? null,
    };
  });
}

export async function getBookingSummaryById(
  id: string,
  _client?: unknown,
): Promise<Booking> {
  const db = await getDb();
  const rawBooking = await db.collection('bookings').findOne({ id });
  if (!rawBooking) throw new Error('Booking not found');

  const booking = cleanDoc<Booking>(rawBooking);

  const [room, hostProfile, unitDoc, bill] = await Promise.all([
    db.collection('rooms').findOne({ id: booking.room_id }),
    booking.host_profile_id
      ? db.collection('profiles').findOne({ id: booking.host_profile_id })
      : Promise.resolve(null),
    db.collection('units').findOne({ id: booking.unit_id }),
    db.collection('room_bills').findOne({ booking_id: id }),
  ]);

  return {
    ...booking,
    room: {
      name: room?.name ?? 'Unknown Room',
    },
    host_profile: hostProfile
      ? {
          id: hostProfile.id,
          full_name: hostProfile.full_name ?? null,
          rank: hostProfile.rank ?? null,
          service_no: hostProfile.service_no ?? null,
        }
      : null,
    unit: {
      guest_food_per_night: Number(unitDoc?.guest_food_per_night ?? 900),
    },
    bill: bill
      ? {
          id: bill.id || bill._id?.toString(),
          status: bill.status,
          payment_status: bill.payment_status,
          folio_number: bill.folio_number ?? null,
          settlement_type: bill.settlement_type,
          total_amount: Number(bill.total_amount || 0),
        }
      : null,
  };
}

export async function getRoomsByIds(
  unitId: string,
  ids: string[],
  _client?: unknown,
): Promise<Room[]> {
  if (ids.length === 0) return [];

  const db = await getDb();
  const rawRooms = await db
    .collection('rooms')
    .find({ unit_id: unitId, id: { $in: ids } })
    .sort({ name: 1 })
    .toArray();

  const today = new Date().toISOString().split('T')[0];

  const activeBookings = await db
    .collection('bookings')
    .find({
      unit_id: unitId,
      room_id: { $in: ids },
      status: { $in: ['checked_in', 'confirmed'] },
      check_in_date: { $lte: today },
      check_out_date: { $gt: today },
    })
    .toArray();

  const bookingByRoom = new Map<string, Document>();
  for (const b of activeBookings) {
    const existing = bookingByRoom.get(b.room_id);
    if (!existing || (existing.status !== 'checked_in' && b.status === 'checked_in')) {
      bookingByRoom.set(b.room_id, b);
    }
  }

  return rawRooms.map((r: Document) => {
    const room = cleanDoc<Room>(r);
    const booking = bookingByRoom.get(room.id);

    let current_status: RoomCurrentStatus = 'vacant';
    let current_booking_id: string | null = null;

    if (room.status === 'maintenance') {
      current_status = 'maintenance';
    } else if (room.status === 'out_of_service') {
      current_status = 'out_of_service';
    } else if (booking) {
      current_status = booking.status === 'checked_in' ? 'occupied' : 'reserved';
      current_booking_id = booking.id || booking._id?.toString() || null;
    }

    return {
      ...room,
      nightly_rate: Number(room.nightly_rate || 0),
      current_status,
      current_booking_id,
    };
  });
}

export async function getBookingById(
  id: string,
  _client?: unknown,
): Promise<BookingWithBill> {
  const db = await getDb();
  const rawBooking = await db.collection('bookings').findOne({ id });
  if (!rawBooking) throw new Error('Booking not found');

  const booking = cleanDoc<Booking>(rawBooking);

  const [room, hostProfile, unitDoc, rawBill] = await Promise.all([
    db.collection('rooms').findOne({ id: booking.room_id }),
    booking.host_profile_id
      ? db.collection('profiles').findOne({ id: booking.host_profile_id })
      : Promise.resolve(null),
    db.collection('units').findOne({ id: booking.unit_id }),
    db.collection('room_bills').findOne({ booking_id: id }),
  ]);

  let billWithLines: RoomBillWithLines | null = null;

  if (rawBill) {
    const bill = cleanDoc<RoomBill>(rawBill);
    const [rawItems, rawOrders] = await Promise.all([
      db.collection('room_bill_items').find({ bill_id: bill.id }).toArray(),
      db.collection('room_bill_orders').find({ bill_id: bill.id }).toArray(),
    ]);

    const items = rawItems.map((i: Document) => cleanDoc<RoomBillItem>(i));
    const orders = rawOrders.map((o: Document) => ({
      ...cleanDoc<BillOrder>(o),
      items: items.filter((item) => item.order_id === o.id),
    }));

    const normalized = normalizeRoomBillLines({
      ...bill,
      total_amount: Number(bill.total_amount || 0),
      items,
      orders,
    });
    billWithLines = normalized as RoomBillWithLines;
  }

  return {
    ...booking,
    room: {
      name: room?.name ?? 'Unknown Room',
    },
    host_profile: hostProfile
      ? {
          id: hostProfile.id,
          full_name: hostProfile.full_name ?? null,
          rank: hostProfile.rank ?? null,
          service_no: hostProfile.service_no ?? null,
        }
      : null,
    unit: {
      guest_food_per_night: Number(unitDoc?.guest_food_per_night ?? 900),
    },
    bill: billWithLines,
  };
}


export async function getAvailableRooms(
  unitId: string,
  checkIn: string,
  checkOut: string,
  _client?: unknown,
): Promise<Room[]> {
  const db = await getDb();
  const roomsCol = db.collection('rooms');
  const bookingsCol = db.collection('bookings');

  // Only operational status 'available' is bookable
  const rawRooms = await roomsCol
    .find({ unit_id: unitId, status: 'available' })
    .sort({ name: 1 })
    .toArray();

  // Find booked room IDs overlapping with [checkIn, checkOut)
  const bookedBookings = await bookingsCol
    .find({
      unit_id: unitId,
      status: { $ne: 'cancelled' },
      check_in_date: { $lt: checkOut },
      check_out_date: { $gt: checkIn },
    })
    .project({ room_id: 1 })
    .toArray();

  const bookedIds = new Set(bookedBookings.map((b: Document) => b.room_id).filter(Boolean));

  return rawRooms
    .filter((r: Document) => !bookedIds.has(r.id))
    .map((r: Document) => cleanDoc<Room>(r));
}

export async function getUnitFurniture(
  unitId: string,
  _client?: unknown,
): Promise<UnitFurniture[]> {
  const col = await getCollection('unit_furniture');
  const items = await col.find({ unit_id: unitId }).sort({ name: 1 }).toArray();
  return items.map((i: Document) => cleanDoc<UnitFurniture>(i));
}

export async function getRoomInventory(
  roomId: string,
  _client?: unknown,
): Promise<RoomFurniture[]> {
  const db = await getDb();
  const rawRoomFurniture = await db
    .collection('room_furniture')
    .find({ room_id: roomId })
    .sort({ created_at: 1 })
    .toArray();

  if (rawRoomFurniture.length === 0) return [];

  const furnitureIds = [
    ...new Set(rawRoomFurniture.map((rf: Document) => rf.furniture_id).filter(Boolean)),
  ];

  const rawUnitFurniture = await db
    .collection('unit_furniture')
    .find({ id: { $in: furnitureIds } })
    .toArray();

  const furnitureMap = new Map<string, Document>(
    rawUnitFurniture.map((f: Document) => [f.id, f]),
  );

  return rawRoomFurniture.map((rf: Document) => {
    const item = cleanDoc<RoomFurniture>(rf);
    const matched = furnitureMap.get(item.furniture_id);
    return {
      ...item,
      furniture: matched
        ? {
            name: String(matched.name),
            kind: String(matched.kind || 'furniture'),
          }
        : null,
    };
  });
}

export async function getDailyBookingStats(
  unitId: string,
  from: string,
  to: string,
  _client?: unknown,
): Promise<Record<string, number>> {
  const col = await getCollection('bookings');
  const bookings = await col
    .find({
      unit_id: unitId,
      status: { $ne: 'cancelled' },
      check_in_date: { $lt: to },
      check_out_date: { $gt: from },
    })
    .project({ check_in_date: 1, check_out_date: 1 })
    .toArray();

  const stats: Record<string, number> = {};
  bookings.forEach((booking: Document) => {
    const curr = new Date(booking.check_in_date);
    const end = new Date(booking.check_out_date);
    while (curr < end) {
      const d = curr.toISOString().split('T')[0];
      if (d >= from && d <= to) {
        stats[d] = (stats[d] || 0) + 1;
      }
      curr.setDate(curr.getDate() + 1);
    }
  });

  return stats;
}

export async function listHostProfiles(
  unitId: string,
  _client?: unknown,
): Promise<HostProfile[]> {
  const col = await getCollection('profiles');
  const profiles = await col
    .find({ unit_id: unitId })
    .sort({ full_name: 1 })
    .toArray();

  return profiles.map((p: Document) => ({
    id: p.id || p._id?.toString(),
    full_name: p.full_name ?? null,
    rank: p.rank ?? null,
    service_no: p.service_no ?? null,
  }));
}
