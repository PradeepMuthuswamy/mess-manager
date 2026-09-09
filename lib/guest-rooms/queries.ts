import 'server-only';
import { createClient } from '@/lib/supabase/server';

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
  RoomBillItem,
  RoomBillSummary,
  RoomBillWithLines,
  RoomBillDetail,
  BillOrder,
  UnitGuestTariff,
} from './types';

const BOOKING_LIST_SELECT = `
  *,
  room:room_id (name),
  host_profile:profiles!bookings_host_profile_id_fkey (id, full_name, rank, service_no),
  unit:unit_id (guest_food_per_night),
  bill:room_bills (id, status, payment_status, folio_number, settlement_type, total_amount)
`;

const BILL_ITEM_SELECT =
  'id, bill_id, category, description, amount, quantity, meal_type, order_id, variant_id, bar_chit_id, created_at';

const BOOKING_BILL_SELECT = `
  *,
  room:room_id (name),
  host_profile:profiles!bookings_host_profile_id_fkey (id, full_name, rank, service_no),
  unit:unit_id (guest_food_per_night),
  bill:room_bills (
    *,
    items:room_bill_items (${BILL_ITEM_SELECT}),
    orders:room_bill_orders (
      *,
      items:room_bill_items (${BILL_ITEM_SELECT})
    )
  )
`;

const ROOM_BILL_DETAIL_SELECT = `
  *,
  items:room_bill_items (${BILL_ITEM_SELECT}),
  orders:room_bill_orders (
    *,
    items:room_bill_items (${BILL_ITEM_SELECT})
  ),
  booking:bookings (
    id,
    host_profile_id,
    settlement_type,
    unit_id,
    unit:unit_id (guest_food_per_night)
  )
`;

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type RawBillLines = {
  items?: RoomBillItem[] | null;
  orders?: (Omit<BillOrder, 'items'> & { items?: RoomBillItem[] | null })[] | null;
};

/**
 * One consistent folio shape: each line appears once, including bar.
 * PostgREST embeds the same rows at bill root and under orders — keep
 * standalone lines (`order_id` is null) on `items` and order lines nested.
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

function toBillSummary(raw: RoomBillSummary | RoomBillSummary[] | null | undefined): RoomBillSummary | null {
  return asOne(raw);
}

function toUnitTariff(
  raw: UnitGuestTariff | UnitGuestTariff[] | null | undefined,
): UnitGuestTariff | null {
  return asOne(raw);
}

export async function getRooms(unitId: string) {
  const supabase = await createClient();
  // Read from the v_rooms_current view so each row carries derived
  // `current_status` and `current_booking_id` alongside the operational
  // `status` column. Occupancy is never stored on rooms — it's computed.
  const { data, error } = await supabase
    .from('v_rooms_current')
    .select('*')
    .eq('unit_id', unitId)
    .order('name');

  if (error) throw new Error(error.message);
  return data as Room[];
}

export async function getBookings(unitId: string, from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_LIST_SELECT)
    .eq('unit_id', unitId)
    .neq('status', 'cancelled')
    .gte('check_out_date', from)
    .lte('check_in_date', to)
    .order('check_in_date');

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const raw = row as unknown as Booking & {
      bill?: RoomBillSummary | RoomBillSummary[] | null;
      unit?: UnitGuestTariff | UnitGuestTariff[] | null;
    };
    return {
      ...raw,
      unit: toUnitTariff(raw.unit),
      bill: toBillSummary(raw.bill),
    } satisfies Booking;
  });
}

export async function getBookingSummaryById(id: string): Promise<Booking> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_LIST_SELECT)
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);

  const raw = data as unknown as Booking & {
    bill?: RoomBillSummary | RoomBillSummary[] | null;
    unit?: UnitGuestTariff | UnitGuestTariff[] | null;
  };
  return {
    ...raw,
    unit: toUnitTariff(raw.unit),
    bill: toBillSummary(raw.bill),
  };
}

export async function getRoomsByIds(unitId: string, ids: string[]) {
  if (ids.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_rooms_current')
    .select('*')
    .eq('unit_id', unitId)
    .in('id', ids)
    .order('name');

  if (error) throw new Error(error.message);
  return data as Room[];
}

type RawBookingWithBill = Omit<Booking, 'bill' | 'unit'> & {
  unit?: UnitGuestTariff | UnitGuestTariff[] | null;
  bill:
    | (RoomBillWithLines & RawBillLines)
    | (RoomBillWithLines & RawBillLines)[]
    | null;
};

export async function getBookingById(id: string): Promise<BookingWithBill> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_BILL_SELECT)
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);

  const raw = data as unknown as RawBookingWithBill;
  const rawBill = asOne(raw.bill);

  return {
    ...raw,
    unit: toUnitTariff(raw.unit),
    bill: rawBill ? normalizeRoomBillLines(rawBill) : null,
  };
}

export async function getRoomBillById(id: string): Promise<RoomBillDetail> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('room_bills')
    .select(ROOM_BILL_DETAIL_SELECT)
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);

  const raw = data as unknown as RoomBillWithLines &
    RawBillLines & {
      booking:
        | RoomBillDetail['booking']
        | RoomBillDetail['booking'][]
        | null;
    };

  const booking = asOne(raw.booking);
  if (!booking) throw new Error('Room bill is missing its booking');

  const { booking: _ignored, ...bill } = raw;
  return {
    ...normalizeRoomBillLines(bill),
    booking: {
      ...booking,
      unit: toUnitTariff(booking.unit),
    },
  };
}

export async function getGuestFoodPerNight(unitId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('units')
    .select('guest_food_per_night')
    .eq('id', unitId)
    .single();

  if (error) throw new Error(error.message);
  return data.guest_food_per_night;
}

export async function getAvailableRooms(unitId: string, checkIn: string, checkOut: string) {
  const supabase = await createClient();

  // Only operational state 'available' is bookable. 'maintenance' and
  // 'out_of_service' rooms are filtered out at the source.
  const { data: rawRooms, error: roomsError } = await supabase
    .from('rooms')
    .select('*')
    .eq('unit_id', unitId)
    .eq('status', 'available');

  if (roomsError) throw new Error(roomsError.message);

  // Get booked room IDs for the period
  const { data: bookedRooms, error: bookingsError } = await supabase
    .from('bookings')
    .select('room_id')
    .eq('unit_id', unitId)
    .neq('status', 'cancelled')
    .filter('check_in_date', 'lt', checkOut)
    .filter('check_out_date', 'gt', checkIn);

  if (bookingsError) throw new Error(bookingsError.message);

  const bookedIds = new Set(bookedRooms.map(b => b.room_id));

  return rawRooms.filter(room => !bookedIds.has(room.id)) as Room[];
}

export async function getUnitFurniture(unitId: string): Promise<UnitFurniture[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('unit_furniture')
    .select('*')
    .eq('unit_id', unitId)
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as UnitFurniture[];
}

export async function getRoomInventory(roomId: string): Promise<RoomFurniture[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('room_furniture')
    .select('*, furniture:unit_furniture(name, kind)')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  // Cast through unknown: the unit_furniture join shape isn't expressed in
  // the generated row type but matches RoomFurniture's optional `furniture`.
  return (data ?? []) as unknown as RoomFurniture[];
}

export async function getDailyBookingStats(unitId: string, from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bookings')
    .select('check_in_date, check_out_date')
    .eq('unit_id', unitId)
    .neq('status', 'cancelled')
    .filter('check_in_date', 'lt', to)
    .filter('check_out_date', 'gt', from);

  if (error) throw new Error(error.message);

  // Count bookings per day
  const stats: Record<string, number> = {};
  data.forEach(booking => {
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

export async function listHostProfiles(unitId: string): Promise<HostProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, rank, service_no')
    .eq('unit_id', unitId)
    .order('full_name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as HostProfile[];
}
