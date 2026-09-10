import { format, addDays, subMonths, parseISO } from 'date-fns';
import type { MessingBillingMode, MessingMealType } from '@/lib/schemas/messing';

/**
 * Calculates the daily average messing rate (P_d).
 * Formula: P_d = (Morning + Afternoon + Dinner Kitchen Expenditure) / Total Diners Present (P)
 */
export function calculateDailyPRate(
  morningExp: number,
  afternoonExp: number,
  dinnerExp: number,
  presentCount: number
): number {
  if (presentCount <= 0) return 0;
  const total = morningExp + afternoonExp + dinnerExp;
  if (total <= 0) return 0;
  return Math.round((total / presentCount) * 10000) / 10000;
}

/**
 * Returns an array of ISO date strings for each day between startDate and endDate inclusive.
 */
export function calculateCycleDates(startDate: string, endDate: string): string[] {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const dates: string[] = [];

  let cur = start;
  while (cur <= end) {
    dates.push(format(cur, 'yyyy-MM-dd'));
    cur = addDays(cur, 1);
  }
  return dates;
}

/**
 * Derives standard Indian Armed Forces 26th-to-25th billing cycle dates.
 * Example for May 2026:
 * - Start date: 2026-04-26
 * - End date: 2026-05-25
 * - Name: "May 2026 Mess Bill"
 */
export function deriveStandardBillingCycle(
  billingYear: number,
  billingMonth: number
): {
  startDate: string;
  endDate: string;
  name: string;
  dueDate: string;
} {
  // Cycle ends on the 25th of billingMonth
  const end = new Date(billingYear, billingMonth - 1, 25);
  // Cycle starts on the 26th of (billingMonth - 1)
  const prevMonthDate = subMonths(end, 1);
  const start = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), 26);

  // Due date is standard 10th of following month
  const due = new Date(billingYear, billingMonth, 10);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  return {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd'),
    name: `${monthNames[billingMonth - 1]} ${billingYear} Mess Bill`,
    dueDate: format(due, 'yyyy-MM-dd'),
  };
}

export interface MessingCalculationItem {
  date: string;
  description: string;
  amount: number;
}

/**
 * Pure calculation engine for an officer's messing charge across the billing cycle.
 */
export function calculateMemberMessingCycle(params: {
  billingMode: MessingBillingMode;
  cycleDates: string[];
  isAbsentOnDate: (date: string) => boolean;
  pRates: Map<string, number>;
  flatRatesOnDate: (date: string) => Record<MessingMealType, number>;
  isMealCut: (date: string, mealType: MessingMealType) => boolean;
}): {
  total: number;
  items: MessingCalculationItem[];
} {
  const { billingMode, cycleDates, isAbsentOnDate, pRates, flatRatesOnDate, isMealCut } = params;
  let total = 0;
  const items: MessingCalculationItem[] = [];

  const primaryMeals: MessingMealType[] = ['breakfast', 'lunch', 'dinner'];

  for (const dateStr of cycleDates) {
    if (isAbsentOnDate(dateStr)) {
      continue;
    }

    if (billingMode === 'P_REGISTER_SPLIT') {
      const pRate = pRates.get(dateStr) ?? 0;
      if (pRate > 0) {
        total += pRate;
        items.push({
          date: dateStr,
          description: `Daily Messing (P-Rate) for ${dateStr}`,
          amount: pRate,
        });
      }
    } else {
      // FLAT_RATE
      const rates = flatRatesOnDate(dateStr);
      for (const meal of primaryMeals) {
        if (!isMealCut(dateStr, meal)) {
          const rate = rates[meal] ?? 0;
          if (rate > 0) {
            total += rate;
            items.push({
              date: dateStr,
              description: `Messing - ${meal.toUpperCase()} (${dateStr})`,
              amount: rate,
            });
          }
        }
      }
    }
  }

  return {
    total: Math.round(total * 100) / 100,
    items,
  };
}

/** Schema CHECK is pending | finalized. Create path writes pending; only finalized is billable. */
export const BILLABLE_BAR_CHIT_STATUSES = ['finalized'] as const;

export type BarChitRollupRow = {
  id: string;
  profile_id: string | null;
  booking_id: string | null;
  status: string;
  total_amount: number;
  date: string;
};

export type MemberBarChitLine = {
  id: string;
  amount: number;
  date: string;
};

/** Member mess-bill bar bucket: finalized, attributed to a member, not a room folio. */
export function isBillableMemberBarChit(chit: BarChitRollupRow): boolean {
  return (
    (BILLABLE_BAR_CHIT_STATUSES as readonly string[]).includes(chit.status) &&
    chit.profile_id != null &&
    chit.booking_id == null
  );
}

export function groupMemberBarChits(
  chits: BarChitRollupRow[]
): Map<string, MemberBarChitLine[]> {
  const map = new Map<string, MemberBarChitLine[]>();
  for (const chit of chits) {
    if (!isBillableMemberBarChit(chit) || !chit.profile_id) continue;
    const list = map.get(chit.profile_id) ?? [];
    list.push({
      id: chit.id,
      amount: Number(chit.total_amount),
      date: chit.date,
    });
    map.set(chit.profile_id, list);
  }
  return map;
}

export type HostRoomBillRollupRow = {
  id: string;
  total_amount: number;
  settlement_type: string;
  status: string;
  payment_status: string | null;
  paid_at: string | null;
  booking: {
    host_profile_id: string | null;
    guest_name: string | null;
    actual_check_out: string | null;
    check_out_date: string | null;
    room?: { name: string | null } | null;
  } | null;
};

export type MemberRoomBillLine = {
  id: string;
  roomName: string;
  guestName: string;
  amount: number;
  date: string;
};

const ISO_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

/** Calendar date from a date or timestamptz string (ISO prefix, no TZ shift). */
export function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = ISO_DATE_PREFIX.exec(value);
  return match ? match[1] : null;
}

/**
 * Period key for a room folio: actual checkout, else paid_at, else planned check_out_date.
 * Never room_bills.created_at (that is check-in time).
 */
export function roomBillRollupDate(bill: HostRoomBillRollupRow): string | null {
  return (
    toIsoDate(bill.booking?.actual_check_out) ??
    toIsoDate(bill.paid_at) ??
    toIsoDate(bill.booking?.check_out_date)
  );
}

export function isTransferredToMessBill(
  bill: Pick<HostRoomBillRollupRow, 'status' | 'payment_status'>
): boolean {
  return (
    bill.payment_status === 'transferred_to_mess_bill' ||
    bill.status === 'transferred_to_mess_bill'
  );
}

/** Host mess-bill room bucket: CHARGE_TO_HOST + transferred, keyed by host_profile_id (not booked_by). */
export function isHostChargeRoomBill(bill: HostRoomBillRollupRow): boolean {
  return (
    bill.settlement_type === 'CHARGE_TO_HOST' &&
    isTransferredToMessBill(bill) &&
    bill.booking?.host_profile_id != null
  );
}

export function isRoomBillInPeriod(
  bill: HostRoomBillRollupRow,
  startDate: string,
  endDate: string
): boolean {
  const date = roomBillRollupDate(bill);
  if (!date) return false;
  return date >= startDate && date <= endDate;
}

export function groupHostChargeRoomBills(
  bills: HostRoomBillRollupRow[],
  startDate: string,
  endDate: string
): Map<string, MemberRoomBillLine[]> {
  const map = new Map<string, MemberRoomBillLine[]>();
  for (const bill of bills) {
    if (!isHostChargeRoomBill(bill) || !isRoomBillInPeriod(bill, startDate, endDate)) {
      continue;
    }
    const hostId = bill.booking?.host_profile_id;
    const date = roomBillRollupDate(bill);
    if (!hostId || !date) continue;
    const list = map.get(hostId) ?? [];
    list.push({
      id: bill.id,
      roomName: bill.booking?.room?.name ?? 'Room',
      guestName: bill.booking?.guest_name ?? 'Guest',
      amount: Number(bill.total_amount),
      date,
    });
    map.set(hostId, list);
  }
  return map;
}

export const APPROVED_REGISTER_STATUS = 'approved' as const;

/** Kitchen P-register is billable only after Mess Secretary approval. */
export function isApprovedRegisterDay(registerStatus: string | null | undefined): boolean {
  return registerStatus === APPROVED_REGISTER_STATUS;
}

/**
 * Drops P-rates whose kitchen register is missing or not `approved`.
 * A missing expenditure row is treated as not approved (P4-G-007).
 */
export function filterApprovedPRates(
  pRates: Map<string, number>,
  registerStatusByDate: Map<string, string | null | undefined>
): Map<string, number> {
  const approved = new Map<string, number>();
  for (const [date, rate] of pRates) {
    if (isApprovedRegisterDay(registerStatusByDate.get(date))) {
      approved.set(date, rate);
    }
  }
  return approved;
}

export type PeriodChargeFlag = {
  is_billed: boolean;
  billed_period_id: string | null;
};

/** Unbilled, never-attributed, or already locked to this draft period. */
export function isChargeBillableForPeriod(
  charge: PeriodChargeFlag,
  periodId: string
): boolean {
  return !charge.is_billed || charge.billed_period_id == null || charge.billed_period_id === periodId;
}

export type ArrearSourceBill = {
  profile_id: string;
  total_amount: number;
  paid_amount?: number | null;
  status: string;
  period_end_date: string;
};

const ARREAR_STATUSES = new Set(['published', 'overdue']);

export function isArrearBill(bill: ArrearSourceBill, periodStartDate: string): boolean {
  if (!ARREAR_STATUSES.has(bill.status)) return false;
  if (bill.period_end_date >= periodStartDate) return false;
  return Number(bill.total_amount) - Number(bill.paid_amount ?? 0) > 0;
}

/** Unpaid published/overdue bills whose period ended before this cycle starts. */
export function sumArrears(bills: ArrearSourceBill[], periodStartDate: string): number {
  let total = 0;
  for (const bill of bills) {
    if (!isArrearBill(bill, periodStartDate)) continue;
    total += Number(bill.total_amount) - Number(bill.paid_amount ?? 0);
  }
  return Math.round(total * 100) / 100;
}

export function groupMemberArrears(
  bills: ArrearSourceBill[],
  periodStartDate: string
): Map<string, number> {
  const map = new Map<string, number>();
  for (const bill of bills) {
    if (!isArrearBill(bill, periodStartDate)) continue;
    const unpaid = Number(bill.total_amount) - Number(bill.paid_amount ?? 0);
    map.set(bill.profile_id, (map.get(bill.profile_id) ?? 0) + unpaid);
  }
  for (const [id, amount] of map) {
    map.set(id, Math.round(amount * 100) / 100);
  }
  return map;
}

export function sumChargeAmounts(charges: Array<{ amount: number }>): number {
  return Math.round(charges.reduce((sum, charge) => sum + Number(charge.amount), 0) * 100) / 100;
}

export type MessBillAmountParts = {
  messingAmount: number;
  barAmount: number;
  roomAmount: number;
  guestMealAmount: number;
  subscriptionsAmount: number;
  miscAmount: number;
  partyAmount: number;
  arrearsAmount: number;
};

/** Header total — includes party + arrears (P4-G-012 / P4-G-013). */
export function totalMessBillAmount(parts: MessBillAmountParts): number {
  return (
    Math.round(
      (parts.messingAmount +
        parts.barAmount +
        parts.roomAmount +
        parts.guestMealAmount +
        parts.subscriptionsAmount +
        parts.miscAmount +
        parts.partyAmount +
        parts.arrearsAmount) *
        100
    ) / 100
  );
}
