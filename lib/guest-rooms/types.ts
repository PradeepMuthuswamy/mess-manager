// Client-safe row types for the guest-rooms feature.
// queries.ts is `server-only` — importing a type *from* it still pulls the
// module into the client bundle, so these shared shapes live in a separate
// file that has no server-only marker and no runtime dependencies.

import type { Database } from '@/lib/supabase/database.types';

// The display value combining operational status with derived occupancy.
// 'available' itself never appears here — when ops state is 'available',
// the view returns one of the derived occupancy values instead.
export type RoomCurrentStatus =
  | 'occupied'
  | 'reserved'
  | 'vacant'
  | 'maintenance'
  | 'out_of_service';

export type Room = Database['public']['Tables']['rooms']['Row'] & {
  /** Derived from bookings via `v_rooms_current`. Present on rows read
   *  through `getRooms()`; absent for write-side row shapes. */
  current_status?: RoomCurrentStatus;
  current_booking_id?: string | null;
};

export type Booking = Database['public']['Tables']['bookings']['Row'] & {
  room: {
    name: string;
  };
};

export type BillOrder = Database['public']['Tables']['room_bill_orders']['Row'];

export type BookingWithBill = Booking & {
  bill:
    | (Database['public']['Tables']['room_bills']['Row'] & {
        items: Database['public']['Tables']['room_bill_items']['Row'][];
        orders: (BillOrder & {
          items: Database['public']['Tables']['room_bill_items']['Row'][];
        })[];
      })
    | null;
};

export type UnitFurniture =
  Database['public']['Tables']['unit_furniture']['Row'];

export type RoomFurniture =
  Database['public']['Tables']['room_furniture']['Row'] & {
    /** Populated by `getRoomInventory()`, which selects the related
     *  unit_furniture name/kind via the foreign-key join. */
    furniture?: { name: string; kind: string } | null;
  };

/** In-form editable row shape. Kept structural (not DB-derived) so client
 *  form code stays decoupled from the generated database types. */
export type RoomInventoryRow = {
  furniture_id: string;
  quantity: number;
  condition: 'good' | 'fair' | 'poor';
  notes: string | null;
};
