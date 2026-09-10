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
  isChargeBillableForPeriod,
  isHostChargeRoomBill,
  isRoomBillInPeriod,
  type ArrearSourceBill,
  type BarChitRollupRow,
  type HostRoomBillRollupRow,
} from './compute';
import type { Database } from '@/lib/supabase/database.types';

export type GuestMealBillRow = Database['public']['Tables']['guest_meals']['Row'];
export type PartyChargeBillRow = Database['public']['Tables']['mess_party_charges']['Row'];

/** Generated types lag `billed_period_id` on misc debits. */
export type MiscDebitBillRow = Database['public']['Tables']['mess_misc_debits']['Row'] & {
  billed_period_id: string | null;
};

export type HostRoomBillWithPeriodFlag = HostRoomBillRollupRow & {
  is_billed: boolean;
  billed_period_id: string | null;
};

export type PublishedBillForEmail = {
  id: string;
  bill_number: string;
  total_amount: number;
  due_date: string;
  profile_id: string;
  email: string | null;
  full_name: string | null;
  period_name: string;
};

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
  is_billed?: boolean;
  billed_period_id?: string | null;
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

function normalizeRoomBillRow(row: RoomBillQueryRow): HostRoomBillWithPeriodFlag {
  const raw = Array.isArray(row.booking) ? row.booking[0] : row.booking;
  return {
    id: row.id,
    total_amount: Number(row.total_amount),
    settlement_type: row.settlement_type,
    status: row.status,
    payment_status: row.payment_status,
    paid_at: row.paid_at,
    is_billed: Boolean(row.is_billed),
    billed_period_id: row.billed_period_id ?? null,
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
): Promise<HostRoomBillWithPeriodFlag[]> {
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
      is_billed,
      billed_period_id,
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

/**
 * Kitchen P-register status by expenditure date (missing row = not approved).
 */
export async function getRegisterStatusByDate(
  unitId: string,
  startDate: string,
  endDate: string
): Promise<Map<string, string | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_daily_expenditures')
    .select('expenditure_date, register_status')
    .eq('unit_id', unitId)
    .gte('expenditure_date', startDate)
    .lte('expenditure_date', endDate);

  if (error) throw new Error(error.message);

  const map = new Map<string, string | null>();
  for (const row of data ?? []) {
    map.set(row.expenditure_date, row.register_status);
  }
  return map;
}

export async function getBillableGuestMealsForPeriod(
  unitId: string,
  periodId: string,
  startDate: string,
  endDate: string
): Promise<GuestMealBillRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('guest_meals')
    .select('*')
    .eq('unit_id', unitId)
    .gte('meal_date', startDate)
    .lte('meal_date', endDate);

  if (error) throw new Error(error.message);
  return (data ?? []).filter((row) => isChargeBillableForPeriod(row, periodId));
}

export async function getBillableMiscDebitsForPeriod(
  unitId: string,
  periodId: string,
  endDate: string
): Promise<MiscDebitBillRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_misc_debits')
    .select('*')
    .eq('unit_id', unitId)
    .lte('charge_date', endDate)
    .or(`is_billed.eq.false,billed_period_id.eq.${periodId}`);

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as MiscDebitBillRow[]).filter((row) =>
    isChargeBillableForPeriod(
      { is_billed: row.is_billed, billed_period_id: row.billed_period_id ?? null },
      periodId
    )
  );
}

export async function getBillablePartyChargesForPeriod(
  unitId: string,
  periodId: string,
  endDate: string
): Promise<PartyChargeBillRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_party_charges')
    .select('*')
    .eq('unit_id', unitId)
    .lte('party_date', endDate)
    .or(`is_billed.eq.false,billed_period_id.eq.${periodId}`);

  if (error) throw new Error(error.message);
  return (data ?? []).filter((row) => isChargeBillableForPeriod(row, periodId));
}

/**
 * Prior published/overdue bills whose period ended before this cycle starts.
 */
export async function getPriorArrearSourceBills(
  unitId: string,
  periodStartDate: string
): Promise<ArrearSourceBill[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_bills')
    .select(
      `
      profile_id,
      total_amount,
      paid_amount,
      status,
      period:mess_billing_periods!inner (
        end_date
      )
    `
    )
    .eq('unit_id', unitId)
    .in('status', ['published', 'overdue']);

  if (error) throw new Error(error.message);

  type ArrearQueryRow = {
    profile_id: string;
    total_amount: number;
    paid_amount: number | null;
    status: string;
    period: { end_date: string } | { end_date: string }[] | null;
  };

  return ((data ?? []) as unknown as ArrearQueryRow[]).map((row) => {
    const period = Array.isArray(row.period) ? row.period[0] : row.period;
    return {
      profile_id: row.profile_id,
      total_amount: Number(row.total_amount),
      paid_amount: Number(row.paid_amount ?? 0),
      status: row.status,
      period_end_date: period?.end_date ?? periodStartDate,
    };
  });
}

export async function getPublishedBillsForEmail(
  periodId: string
): Promise<PublishedBillForEmail[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_bills')
    .select(
      `
      id,
      bill_number,
      total_amount,
      due_date,
      profile_id,
      profile:profiles (
        email,
        full_name
      ),
      period:mess_billing_periods (
        name
      )
    `
    )
    .eq('billing_period_id', periodId)
    .eq('status', 'published');

  if (error) throw new Error(error.message);

  type NotifyQueryRow = {
    id: string;
    bill_number: string;
    total_amount: number;
    due_date: string;
    profile_id: string;
    profile:
      | { email: string | null; full_name: string | null }
      | { email: string | null; full_name: string | null }[]
      | null;
    period: { name: string } | { name: string }[] | null;
  };

  return ((data ?? []) as unknown as NotifyQueryRow[]).map((row) => {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    const period = Array.isArray(row.period) ? row.period[0] : row.period;
    return {
      id: row.id,
      bill_number: row.bill_number,
      total_amount: Number(row.total_amount),
      due_date: row.due_date,
      profile_id: row.profile_id,
      email: profile?.email ?? null,
      full_name: profile?.full_name ?? null,
      period_name: period?.name ?? 'Mess bill',
    };
  });
}

export async function getSentMessBillEmailIds(periodId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_bill_email_sends')
    .select('bill_id')
    .eq('billing_period_id', periodId)
    .eq('status', 'sent');

  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.bill_id));
}
