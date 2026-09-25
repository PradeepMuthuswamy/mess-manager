// Client-safe row types for the guest-rooms feature.
// queries.ts is `server-only` — importing a type *from* it still pulls the
// module into the client bundle, so these shared shapes live in a separate
// file that has no server-only marker and no runtime dependencies.

// The display value combining operational status with derived occupancy.
// 'available' itself never appears here — when ops state is 'available',
// the view returns one of the derived occupancy values instead.
export type RoomCurrentStatus =
  | 'occupied'
  | 'reserved'
  | 'vacant'
  | 'maintenance'
  | 'out_of_service';

export type RoomStatus = 'available' | 'maintenance' | 'out_of_service';
export type RoomType = 'Standard' | 'Deluxe' | 'Executive' | 'Suite' | 'VIP';

export interface Room {
  id: string;
  unit_id: string;
  name: string;
  room_type: string;
  nightly_rate: number;
  status: RoomStatus;
  created_at?: string;
  updated_at?: string;
  /** Derived from bookings via active stay window calculation */
  current_status?: RoomCurrentStatus;
  current_booking_id?: string | null;
}

export type BookingStatus = 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';
export type BookingCategory =
  | 'MEMBER_GUEST'
  | 'TRANSIT_OFFICER'
  | 'OFFICIAL_DELEGATION'
  | 'OUTSIDE_CIVILIAN';
export type GuestSettlementType = 'DIRECT_SETTLEMENT' | 'CHARGE_TO_HOST';

export interface HostProfile {
  id: string;
  full_name: string | null;
  rank: string | null;
  service_no: string | null;
}

/** Tariff slice from `units` — join only; do not invent extra unit columns. */
export interface UnitGuestTariff {
  guest_food_per_night: number;
}

export type RoomBillStatus =
  | 'draft'
  | 'finalized'
  | 'paid'
  | 'transferred_to_mess_bill';

export type RoomBillPaymentStatus =
  | 'draft'
  | 'paid'
  | 'transferred_to_mess_bill';

export interface RoomBill {
  id: string;
  unit_id: string;
  booking_id: string;
  total_amount: number;
  status: RoomBillStatus;
  payment_status?: RoomBillPaymentStatus;
  settlement_type?: GuestSettlementType;
  paid_amount?: number;
  paid_at?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  folio_number?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Slim bill join for list/summary queries (settlement + folio badges). */
export interface RoomBillSummary {
  id: string;
  status: RoomBillStatus;
  payment_status?: RoomBillPaymentStatus;
  folio_number?: string | null;
  settlement_type?: GuestSettlementType;
  total_amount: number;
}

export type BillItemCategory = 'room_rent' | 'food' | 'adhoc' | 'misc' | 'bar';
export type MealType = 'breakfast' | 'lunch' | 'dinner';

export interface RoomBillItem {
  id: string;
  bill_id: string;
  category: BillItemCategory;
  description: string;
  amount: number;
  quantity: number;
  variant_id?: string | null;
  item_id?: string | null;
  meal_type?: MealType | null;
  order_id?: string | null;
  bar_chit_id?: string | null;
  created_at?: string;
}

export interface RoomBillOrder {
  id: string;
  bill_id: string;
  label: string;
  occurred_at?: string;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BillOrder extends RoomBillOrder {
  items: RoomBillItem[];
}

/**
 * Canonical bill shape for the billing / checkout dialogs.
 *
 * `items` is the standalone folio list (`order_id` is null), including
 * `category='bar'` with `bar_chit_id` / `variant_id`.
 * `orders[].items` hold only that order's lines. No line appears in both.
 */
export interface RoomBillWithLines extends RoomBill {
  items: RoomBillItem[];
  orders: BillOrder[];
}

export interface Booking {
  id: string;
  unit_id: string;
  room_id: string;
  guest_name: string;
  guest_rank?: string | null;
  guest_phone?: string | null;
  guest_email?: string | null;
  check_in_date: string;
  check_out_date: string;
  actual_check_in?: string | null;
  actual_check_out?: string | null;
  status: BookingStatus;
  booking_category?: BookingCategory;
  host_profile_id?: string | null;
  settlement_type?: GuestSettlementType;
  special_requests?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  room: {
    name: string;
  };
  host_profile?: HostProfile | null;
  unit?: UnitGuestTariff | null;
  /** Present when the query joins `room_bills` (list / summary). */
  bill?: RoomBillSummary | null;
}

export interface BookingWithBill extends Omit<Booking, 'bill'> {
  bill: RoomBillWithLines | null;
}

export interface RoomBillDetail extends RoomBillWithLines {
  booking: Pick<
    Booking,
    'id' | 'host_profile_id' | 'settlement_type' | 'unit_id'
  > & {
    unit?: UnitGuestTariff | null;
  };
}

export interface UnitFurniture {
  id: string;
  unit_id: string;
  name: string;
  kind: 'furniture' | 'fixture' | 'equipment' | 'other';
  created_at?: string;
  updated_at?: string;
}

export interface RoomFurniture {
  id: string;
  room_id: string;
  furniture_id: string;
  quantity: number;
  condition: 'good' | 'fair' | 'poor';
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  /** Populated by `getRoomInventory()`, which selects the related
   *  unit_furniture name/kind via join. */
  furniture?: { name: string; kind: string } | null;
}

/** In-form editable row shape. Kept structural so client
 *  form code stays decoupled. */
export interface RoomInventoryRow {
  furniture_id: string;
  quantity: number;
  condition: 'good' | 'fair' | 'poor';
  notes: string | null;
}

export interface WaitlistRequest {
  id: string;
  unit_id: string;
  profile_id: string;
  guest_name: string;
  requested_from: string;
  requested_to: string;
  notes: string | null;
  status: 'requested' | 'offered' | 'cancelled' | 'booked';
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
}

export type RoomWaitlistRequest = WaitlistRequest;
