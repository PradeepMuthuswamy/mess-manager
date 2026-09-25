import 'server-only';
import { getDb } from '@/lib/mongo';
import type { Document } from 'mongodb';
import type {
  MessBillingPeriodRow,
  MessBillingPeriod,
  MessBill,
  MessBillLineItem,
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
import type { GuestMeal } from '@/lib/messing/types';
import type { MessPartyCharge } from '@/lib/parties/types';

export type GuestMealBillRow = GuestMeal;
export type PartyChargeBillRow = MessPartyCharge & { billed_period_id?: string | null };

/** Generated types lag `billed_period_id` on misc debits. */
export type MiscDebitBillRow = MessMiscDebitRow & {
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

function cleanDoc<T>(doc: Record<string, unknown> | null | undefined): T {
  if (!doc) return doc as T;
  const { _id, ...rest } = doc;
  return rest as T;
}

/**
 * Returns all billing periods for a unit.
 */
export async function getBillingPeriods(unitId: string): Promise<MessBillingPeriodRow[]> {
  const db = await getDb();
  const docs = await db
    .collection('mess_billing_periods')
    .find({ unit_id: unitId })
    .sort({ start_date: -1 })
    .toArray();

  return docs.map((d: Document) => cleanDoc<MessBillingPeriodRow>(d));
}

/**
 * Returns the latest open or draft billing period for a unit.
 */
export async function getCurrentBillingPeriod(
  unitId: string
): Promise<MessBillingPeriodRow | null> {
  const db = await getDb();
  const doc = await db
    .collection('mess_billing_periods')
    .find({
      unit_id: unitId,
      status: { $in: ['open', 'draft', 'published'] },
    })
    .sort({ start_date: -1 })
    .limit(1)
    .next();

  return doc ? cleanDoc<MessBillingPeriodRow>(doc) : null;
}

/**
 * Returns all bills for a particular member across periods.
 */
export async function getMyMessBills(profileId: string): Promise<MessBillWithDetails[]> {
  const db = await getDb();
  const bills = await db
    .collection('mess_bills')
    .find({
      profile_id: profileId,
      status: { $in: ['published', 'paid', 'overdue'] },
    })
    .sort({ created_at: -1 })
    .toArray();

  if (bills.length === 0) return [];

  const periodIds = Array.from(new Set(bills.map((b: Document) => b.billing_period_id as string).filter(Boolean)));
  const periods = periodIds.length > 0
    ? await db.collection('mess_billing_periods').find({ id: { $in: periodIds } }).toArray()
    : [];
  const periodMap = new Map(periods.map((p: Document) => [p.id as string, cleanDoc<MessBillingPeriod>(p)]));

  return bills.map((b: Document) => {
    const bill = cleanDoc<MessBill>(b);
    return {
      ...bill,
      period: bill.billing_period_id ? periodMap.get(bill.billing_period_id) ?? null : null,
    };
  });
}

/**
 * Returns all bills generated for a specific billing period (Mess Secretary audit view).
 */
export async function getMessBillsForPeriod(periodId: string): Promise<MessBillWithDetails[]> {
  const db = await getDb();
  const bills = await db
    .collection('mess_bills')
    .find({ billing_period_id: periodId })
    .sort({ bill_number: 1 })
    .toArray();

  if (bills.length === 0) return [];

  const profileIds = Array.from(new Set(bills.map((b: Document) => b.profile_id as string).filter(Boolean)));
  const profiles = profileIds.length > 0
    ? await db.collection('profiles').find({ id: { $in: profileIds } }).toArray()
    : [];
  const profileMap = new Map(profiles.map((p: Document) => [p.id as string, p]));

  return bills.map((b: Document) => {
    const bill = cleanDoc<MessBill>(b);
    const prof = bill.profile_id ? profileMap.get(bill.profile_id) : null;
    return {
      ...bill,
      profile: prof
        ? {
            id: prof.id as string,
            full_name: (prof.full_name as string) ?? null,
            service_no: (prof.service_no as string) ?? null,
            rank: (prof.rank as string) ?? null,
          }
        : null,
    };
  });
}

/**
 * Fetches a single mess bill with its granular line items.
 */
export async function getMessBillDetails(billId: string): Promise<MessBillWithDetails | null> {
  const db = await getDb();
  const rawBill = await db.collection('mess_bills').findOne({ id: billId });
  if (!rawBill) return null;

  const bill = cleanDoc<MessBill>(rawBill);

  const [rawPeriod, rawProfile, lineItemsDocs] = await Promise.all([
    bill.billing_period_id
      ? db.collection('mess_billing_periods').findOne({ id: bill.billing_period_id })
      : Promise.resolve(null),
    bill.profile_id
      ? db.collection('profiles').findOne({ id: bill.profile_id })
      : Promise.resolve(null),
    db
      .collection('mess_bill_line_items')
      .find({ bill_id: billId })
      .sort({ item_date: 1 })
      .toArray(),
  ]);

  return {
    ...bill,
    period: rawPeriod ? cleanDoc<MessBillingPeriod>(rawPeriod) : null,
    profile: rawProfile
      ? {
          id: rawProfile.id as string,
          full_name: (rawProfile.full_name as string) ?? null,
          service_no: (rawProfile.service_no as string) ?? null,
          rank: (rawProfile.rank as string) ?? null,
        }
      : null,
    line_items: lineItemsDocs.map((item: Document) => cleanDoc<MessBillLineItem>(item)),
  };
}

/**
 * Lists all recurring mess subscriptions for a unit.
 */
export async function getSubscriptions(unitId: string): Promise<MessSubscriptionRow[]> {
  const db = await getDb();
  const docs = await db
    .collection('mess_subscriptions')
    .find({ unit_id: unitId })
    .sort({ name: 1 })
    .toArray();

  return docs.map((d: Document) => cleanDoc<MessSubscriptionRow>(d));
}

/**
 * Lists unbilled or all miscellaneous debits for a member/unit.
 */
export async function getPendingMiscDebits(
  unitId: string,
  profileId?: string
): Promise<MessMiscDebitRow[]> {
  const db = await getDb();
  const filter: Record<string, unknown> = {
    unit_id: unitId,
    is_billed: false,
  };
  if (profileId) {
    filter.profile_id = profileId;
  }
  const docs = await db
    .collection('mess_misc_debits')
    .find(filter)
    .sort({ charge_date: -1 })
    .toArray();

  return docs.map((d: Document) => cleanDoc<MessMiscDebitRow>(d));
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
  const db = await getDb();
  const docs = await db
    .collection('bar_chits')
    .find({
      unit_id: unitId,
      status: { $in: [...BILLABLE_BAR_CHIT_STATUSES] },
      booking_id: null,
      profile_id: { $ne: null },
      date: { $gte: startDate, $lte: endDate },
    })
    .toArray();

  return docs
    .map((d: Document) => cleanDoc<BarChitRollupRow>(d))
    .filter(isBillableMemberBarChit);
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
  const db = await getDb();
  const roomBills = await db
    .collection('room_bills')
    .find({
      unit_id: unitId,
      settlement_type: 'CHARGE_TO_HOST',
    })
    .toArray();

  if (roomBills.length === 0) return [];

  const bookingIds = Array.from(new Set(roomBills.map((rb: Document) => rb.booking_id as string).filter(Boolean)));
  const bookings = bookingIds.length > 0
    ? await db.collection('bookings').find({ id: { $in: bookingIds } }).toArray()
    : [];
  const roomIds = Array.from(new Set(bookings.map((b: Document) => b.room_id as string).filter(Boolean)));
  const rooms = roomIds.length > 0
    ? await db.collection('rooms').find({ id: { $in: roomIds } }).toArray()
    : [];
  const roomMap = new Map(rooms.map((r: Document) => [r.id as string, r]));
  const bookingMap = new Map(
    bookings.map((b: Document) => [
      b.id as string,
      {
        host_profile_id: (b.host_profile_id as string) ?? null,
        guest_name: (b.guest_name as string) ?? null,
        actual_check_out: (b.actual_check_out as string) ?? null,
        check_out_date: (b.check_out_date as string) ?? null,
        room: b.room_id && roomMap.has(b.room_id as string) ? { name: (roomMap.get(b.room_id as string)?.name as string) ?? null } : null,
      },
    ])
  );

  return roomBills
    .map((rb: Document) => {
      const bInfo = rb.booking_id ? bookingMap.get(rb.booking_id as string) ?? null : null;
      return normalizeRoomBillRow({
        id: rb.id as string,
        total_amount: Number(rb.total_amount),
        settlement_type: rb.settlement_type as string,
        status: rb.status as string,
        payment_status: (rb.payment_status as string) ?? null,
        paid_at: (rb.paid_at as string) ?? null,
        is_billed: Boolean(rb.is_billed),
        billed_period_id: (rb.billed_period_id as string) ?? null,
        booking: bInfo,
      });
    })
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
  const db = await getDb();
  const docs = await db
    .collection('mess_daily_expenditures')
    .find({
      unit_id: unitId,
      expenditure_date: { $gte: startDate, $lte: endDate },
    })
    .project({ expenditure_date: 1, register_status: 1 })
    .toArray();

  const map = new Map<string, string | null>();
  for (const row of docs) {
    map.set(row.expenditure_date as string, (row.register_status as string | null) ?? null);
  }
  return map;
}

export async function getBillableGuestMealsForPeriod(
  unitId: string,
  periodId: string,
  startDate: string,
  endDate: string
): Promise<GuestMealBillRow[]> {
  const db = await getDb();
  const docs = await db
    .collection('guest_meals')
    .find({
      unit_id: unitId,
      meal_date: { $gte: startDate, $lte: endDate },
    })
    .toArray();

  return docs
    .map((d: Document) => cleanDoc<GuestMealBillRow>(d))
    .filter((row: GuestMealBillRow) =>
      isChargeBillableForPeriod(
        { is_billed: Boolean(row.is_billed), billed_period_id: row.billed_period_id ?? null },
        periodId
      )
    );
}

export async function getBillableMiscDebitsForPeriod(
  unitId: string,
  periodId: string,
  endDate: string
): Promise<MiscDebitBillRow[]> {
  const db = await getDb();
  const docs = await db
    .collection('mess_misc_debits')
    .find({
      unit_id: unitId,
      charge_date: { $lte: endDate },
      $or: [{ is_billed: false }, { billed_period_id: periodId }],
    })
    .toArray();

  return docs
    .map((d: Document) => cleanDoc<MiscDebitBillRow>(d))
    .filter((row: MiscDebitBillRow) =>
      isChargeBillableForPeriod(
        { is_billed: Boolean(row.is_billed), billed_period_id: row.billed_period_id ?? null },
        periodId
      )
    );
}

export async function getBillablePartyChargesForPeriod(
  unitId: string,
  periodId: string,
  endDate: string
): Promise<PartyChargeBillRow[]> {
  const db = await getDb();
  const docs = await db
    .collection('mess_party_charges')
    .find({
      unit_id: unitId,
      party_date: { $lte: endDate },
      $or: [{ is_billed: false }, { billed_period_id: periodId }],
    })
    .toArray();

  return docs
    .map((d: Document) => cleanDoc<PartyChargeBillRow>(d))
    .filter((row: PartyChargeBillRow) =>
      isChargeBillableForPeriod(
        { is_billed: Boolean(row.is_billed), billed_period_id: row.billed_period_id ?? null },
        periodId
      )
    );
}

/**
 * Prior published/overdue bills whose period ended before this cycle starts.
 */
export async function getPriorArrearSourceBills(
  unitId: string,
  periodStartDate: string
): Promise<ArrearSourceBill[]> {
  const db = await getDb();
  const bills = await db
    .collection('mess_bills')
    .find({
      unit_id: unitId,
      status: { $in: ['published', 'overdue'] },
    })
    .toArray();

  if (bills.length === 0) return [];

  const periodIds = Array.from(new Set(bills.map((b: Document) => b.billing_period_id as string).filter(Boolean)));
  const periods = periodIds.length > 0
    ? await db.collection('mess_billing_periods').find({ id: { $in: periodIds } }).toArray()
    : [];
  const periodMap = new Map(periods.map((p: Document) => [p.id as string, p]));

  return bills.map((b: Document) => {
    const period = b.billing_period_id ? periodMap.get(b.billing_period_id as string) : null;
    return {
      profile_id: b.profile_id as string,
      total_amount: Number(b.total_amount),
      paid_amount: Number(b.paid_amount ?? 0),
      status: b.status as string,
      period_end_date: (period?.end_date as string | undefined) ?? periodStartDate,
    };
  });
}

export async function getPublishedBillsForEmail(
  periodId: string
): Promise<PublishedBillForEmail[]> {
  const db = await getDb();
  const bills = await db
    .collection('mess_bills')
    .find({
      billing_period_id: periodId,
      status: 'published',
    })
    .toArray();

  if (bills.length === 0) return [];

  const profileIds = Array.from(new Set(bills.map((b: Document) => b.profile_id as string).filter(Boolean)));
  const [period, profiles] = await Promise.all([
    db.collection('mess_billing_periods').findOne({ id: periodId }),
    profileIds.length > 0
      ? db.collection('profiles').find({ id: { $in: profileIds } }).toArray()
      : [],
  ]);

  const profileMap = new Map(profiles.map((p: Document) => [p.id as string, p]));
  const periodName = (period?.name as string | undefined) ?? 'Mess bill';

  return bills.map((b: Document) => {
    const profile = b.profile_id ? profileMap.get(b.profile_id as string) : null;
    return {
      id: b.id as string,
      bill_number: b.bill_number as string,
      total_amount: Number(b.total_amount),
      due_date: b.due_date as string,
      profile_id: b.profile_id as string,
      email: (profile?.email as string | undefined) ?? null,
      full_name: (profile?.full_name as string | undefined) ?? null,
      period_name: periodName,
    };
  });
}

export async function getSentMessBillEmailIds(periodId: string): Promise<Set<string>> {
  const db = await getDb();
  const docs = await db
    .collection('mess_bill_email_sends')
    .find({
      billing_period_id: periodId,
      status: 'sent',
    })
    .project({ bill_id: 1 })
    .toArray();

  return new Set(docs.map((row: Document) => row.bill_id as string));
}
