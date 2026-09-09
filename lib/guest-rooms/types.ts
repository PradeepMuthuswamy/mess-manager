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

export type HostProfile = {
  id: string;
  full_name: string | null;
  rank: string | null;
  service_no: string | null;
};

/** Tariff slice from `units` — join only; do not invent extra unit columns. */
export type UnitGuestTariff = Pick<
  Database['public']['Tables']['units']['Row'],
  'guest_food_per_night'
>;

export type RoomBill = Database['public']['Tables']['room_bills']['Row'];

/** Slim bill join for list/summary queries (settlement + folio badges). */
export type RoomBillSummary = Pick<
  RoomBill,
  | 'id'
  | 'status'
  | 'payment_status'
  | 'folio_number'
  | 'settlement_type'
  | 'total_amount'
>;

/**
 * Folio line from `room_bill_items`.
 * Includes `category` (room_rent | food | adhoc | misc | bar),
 * `bar_chit_id`, and `variant_id` — all live columns.
 */
export type RoomBillItem = Database['public']['Tables']['room_bill_items']['Row'];

export type BillOrder = Database['public']['Tables']['room_bill_orders']['Row'] & {
  items: RoomBillItem[];
};

/**
 * Canonical bill shape for the billing / checkout dialogs.
 *
 * `items` is the standalone folio list (`order_id` is null), including
 * `category='bar'` with `bar_chit_id` / `variant_id`.
 * `orders[].items` hold only that order's lines. No line appears in both.
 */
export type RoomBillWithLines = RoomBill & {
  items: RoomBillItem[];
  orders: BillOrder[];
};

export type Booking = Database['public']['Tables']['bookings']['Row'] & {
  room: {
    name: string;
  };
  host_profile?: HostProfile | null;
  unit?: UnitGuestTariff | null;
  /** Present when the query joins `room_bills` (list / summary). */
  bill?: RoomBillSummary | null;
};

export type BookingWithBill = Omit<Booking, 'bill'> & {
  bill: RoomBillWithLines | null;
};

export type RoomBillDetail = RoomBillWithLines & {
  booking: Pick<
    Database['public']['Tables']['bookings']['Row'],
    'id' | 'host_profile_id' | 'settlement_type' | 'unit_id'
  > & {
    unit?: UnitGuestTariff | null;
  };
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
