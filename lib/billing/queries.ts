import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type {
  MessBillingPeriodRow,
  MessBillRow,
  MessBillWithDetails,
  MessSubscriptionRow,
  MessMiscDebitRow,
} from './types';
import {
  BILLABLE_BAR_CHIT_STATUSES,
  isBillableMemberBarChit,
  isHostChargeRoomBill,
  isRoomBillInPeriod,
  type BarChitRollupRow,
  type HostRoomBillRollupRow,
} from './compute';

/**
 * Returns all billing periods for a unit.
 */
export async function getBillingPeriods(unitId: string): Promise<MessBillingPeriodRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_billing_periods')
    .select('*')
    .eq('unit_id', unitId)
    .order('start_date', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Returns the latest open or draft billing period for a unit.
 */
export async function getCurrentBillingPeriod(
  unitId: string
): Promise<MessBillingPeriodRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_billing_periods')
    .select('*')
    .eq('unit_id', unitId)
    .in('status', ['open', 'draft', 'published'])
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Returns all bills for a particular member across periods.
 */
export async function getMyMessBills(profileId: string): Promise<MessBillWithDetails[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_bills')
    .select(`
      *,
      period:mess_billing_periods (*)
    `)
    .eq('profile_id', profileId)
    .in('status', ['published', 'paid', 'overdue'])
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data as unknown as MessBillWithDetails[]) ?? [];
}

/**
 * Returns all bills generated for a specific billing period (Mess Secretary audit view).
 */
export async function getMessBillsForPeriod(periodId: string): Promise<MessBillWithDetails[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_bills')
    .select(`
      *,
      profile:profiles (
        id,
        full_name,
        service_no,
        rank
      )
    `)
    .eq('billing_period_id', periodId)
    .order('bill_number', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as unknown as MessBillWithDetails[]) ?? [];
}

/**
 * Fetches a single mess bill with its granular line items.
 */
export async function getMessBillDetails(billId: string): Promise<MessBillWithDetails | null> {
  const supabase = await createClient();
  const { data: bill, error: billErr } = await supabase
    .from('mess_bills')
    .select(`
      *,
      period:mess_billing_periods (*),
      profile:profiles (
        id,
        full_name,
        service_no,
        rank
      )
    `)
    .eq('id', billId)
    .maybeSingle();

  if (billErr) throw new Error(billErr.message);
  if (!bill) return null;

  const { data: lineItems, error: itemsErr } = await supabase
    .from('mess_bill_line_items')
    .select('*')
    .eq('bill_id', billId)
    .order('item_date', { ascending: true });

  if (itemsErr) throw new Error(itemsErr.message);

  return {
    ...(bill as unknown as MessBillWithDetails),
    line_items: lineItems ?? [],
  };
}

/**
 * Lists all recurring mess subscriptions for a unit.
 */
export async function getSubscriptions(unitId: string): Promise<MessSubscriptionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_subscriptions')
    .select('*')
    .eq('unit_id', unitId)
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Lists unbilled or all miscellaneous debits for a member/unit.
 */
export async function getPendingMiscDebits(
  unitId: string,
  profileId?: string
): Promise<MessMiscDebitRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from('mess_misc_debits')
    .select('*')
    .eq('unit_id', unitId)
    .eq('is_billed', false)
    .order('charge_date', { ascending: false });

  if (profileId) {
    query = query.eq('profile_id', profileId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Member bar chits for a billing cycle.
 * Finalized only (schema: pending | finalized). Guest-folio chits (booking_id set) are excluded.
 */
export async function getBillableBarChitsForPeriod(
  unitId: string,
  startDate: string,
  endDate: string
): Promise<BarChitRollupRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bar_chits')
    .select('id, profile_id, booking_id, status, total_amount, date')
    .eq('unit_id', unitId)
    .in('status', [...BILLABLE_BAR_CHIT_STATUSES])
    .is('booking_id', null)
    .not('profile_id', 'is', null)
    .gte('date', startDate)
    .lte('date', endDate);

  if (error) throw new Error(error.message);
  return (data ?? []).filter(isBillableMemberBarChit);
}

type RoomBillQueryRow = {
  id: string;
  total_amount: number;
  settlement_type: string;
  status: string;
  payment_status: string | null;
  paid_at: string | null;
  booking:
    | {
        host_profile_id: string | null;
        guest_name: string | null;
        actual_check_out: string | null;
        check_out_date: string | null;
        room: { name: string | null } | null;
      }
    | {
        host_profile_id: string | null;
        guest_name: string | null;
        actual_check_out: string | null;
        check_out_date: string | null;
        room: { name: string | null } | null;
      }[]
    | null;
};

function normalizeRoomBillRow(row: RoomBillQueryRow): HostRoomBillRollupRow {
  const raw = Array.isArray(row.booking) ? row.booking[0] : row.booking;
  return {
    id: row.id,
    total_amount: Number(row.total_amount),
    settlement_type: row.settlement_type,
    status: row.status,
    payment_status: row.payment_status,
    paid_at: row.paid_at,
    booking: raw
      ? {
          host_profile_id: raw.host_profile_id,
          guest_name: raw.guest_name,
          actual_check_out: raw.actual_check_out,
          check_out_date: raw.check_out_date,
          room: raw.room,
        }
      : null,
  };
}

/**
 * Host-charged room folios for a billing cycle.
 * Period key is actual_check_out (then paid_at), never room_bills.created_at.
 * Member key is bookings.host_profile_id — not booked_by.
 */
export async function getHostChargeRoomBillsForPeriod(
  unitId: string,
  startDate: string,
  endDate: string
): Promise<HostRoomBillRollupRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('room_bills')
    .select(
      `
      id,
      total_amount,
      settlement_type,
      status,
      payment_status,
      paid_at,
      booking:bookings!inner (
        host_profile_id,
        guest_name,
        actual_check_out,
        check_out_date,
        room:rooms (
          name
        )
      )
    `
    )
    .eq('unit_id', unitId)
    .eq('settlement_type', 'CHARGE_TO_HOST');

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as RoomBillQueryRow[])
    .map(normalizeRoomBillRow)
    .filter(
      (bill) => isHostChargeRoomBill(bill) && isRoomBillInPeriod(bill, startDate, endDate)
    );
}
