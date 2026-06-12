import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

export type BarChitRow = Database['public']['Tables']['bar_chits']['Row'] & {
  profile: { id: string; full_name: string | null; email: string | null; rank: string | null; service_no: string | null } | null;
  booking: { id: string; guest_name: string; room: { name: string } | null } | null;
  items: (Database['public']['Tables']['bar_chit_items']['Row'] & {
    variant: {
      id: string;
      product: { name: string } | null;
      unit_value: number;
      unit_type: string;
      package_type: string;
    } | null;
  })[];
};

export async function getBarInventory(unitId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_unit_inventory_current')
    .select('*')
    .eq('unit_id', unitId)
    .in('category', ['alcohol', 'cigar', 'soft_drink', 'grocery'])
    .eq('is_active', true)
    .gt('qty_packs', 0)
    .order('item_name');

  if (error) throw new Error(error.message);
  return data;
}

export async function listBarChits(unitId: string): Promise<BarChitRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bar_chits')
    .select(`
      *,
      profile:profile_id (id, full_name, email, rank, service_no),
      booking:booking_id (
        id,
        guest_name,
        room:room_id (name)
      ),
      items:bar_chit_items (
        *,
        variant:variant_id (
          id,
          unit_value,
          unit_type,
          package_type,
          product:product_id (name)
        )
      )
    `)
    .eq('unit_id', unitId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data as unknown as BarChitRow[];
}

export async function listUnitMembers(unitId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, rank, service_no')
    .eq('unit_id', unitId)
    .eq('is_active', true)
    .order('full_name');

  if (error) throw new Error(error.message);
  return data;
}

export async function listActiveBookings(unitId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id,
      guest_name,
      guest_rank,
      status,
      room:room_id (name)
    `)
    .eq('unit_id', unitId)
    .in('status', ['confirmed', 'checked_in'])
    .order('guest_name');

  if (error) throw new Error(error.message);
  
  return (data ?? []).map((b) => ({
    id: b.id,
    guest_name: b.guest_name,
    guest_rank: b.guest_rank,
    status: b.status ?? 'confirmed',
    room_name: (b.room as unknown as { name: string } | null)?.name ?? 'Unknown Room',
  }));
}
