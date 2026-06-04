import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { Database } from '@/lib/supabase/database.types';

export type { Room, Booking, BookingWithBill, UnitFurniture, RoomFurniture } from './types';
import type { Room, Booking, BookingWithBill, UnitFurniture, RoomFurniture } from './types';

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
    .select(`
      *,
      room:room_id (name)
    `)
    .eq('unit_id', unitId)
    .gte('check_out_date', from)
    .lte('check_in_date', to)
    .order('check_in_date');

  if (error) throw new Error(error.message);
  return data as Booking[];
}

type RawBookingWithBill = Database['public']['Tables']['bookings']['Row'] & {
  room: { name: string };
  bill: (Database['public']['Tables']['room_bills']['Row'] & {
    items: Database['public']['Tables']['room_bill_items']['Row'][];
    orders: (Database['public']['Tables']['room_bill_orders']['Row'] & {
      items: Database['public']['Tables']['room_bill_items']['Row'][];
    })[];
  })[];
};

export async function getBookingById(id: string): Promise<BookingWithBill> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      room:room_id (name),
      bill:room_bills (
        *,
        items:room_bill_items (*),
        orders:room_bill_orders (
          *,
          items:room_bill_items (*)
        )
      )
    `)
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  
  const rawData = data as unknown as RawBookingWithBill;
  const bill = rawData.bill?.[0] ? {
    ...rawData.bill[0],
    items: rawData.bill[0].items ?? [],
    orders: (rawData.bill[0].orders ?? []).map(order => ({
      ...order,
      items: order.items ?? []
    }))
  } : null;

  return {
    ...rawData,
    bill
  } as BookingWithBill;
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
