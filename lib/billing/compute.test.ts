import { describe, expect, it } from 'vitest';
import {
  calculateDailyPRate,
  calculateCycleDates,
  deriveStandardBillingCycle,
  calculateMemberMessingCycle,
  BILLABLE_BAR_CHIT_STATUSES,
  isBillableMemberBarChit,
  groupMemberBarChits,
  roomBillRollupDate,
  isHostChargeRoomBill,
  groupHostChargeRoomBills,
  type BarChitRollupRow,
  type HostRoomBillRollupRow,
} from './compute';
import type { MessingMealType } from '@/lib/schemas/messing';

describe('calculateDailyPRate', () => {
  it('correctly divides total expenditure by present diners (User exact example: 8.61)', () => {
    // ₹200 morning + ₹350 afternoon + ₹311 dinner = ₹861 total
    // 100 officers present => ₹8.61 per diner
    const pRate = calculateDailyPRate(200, 350, 311, 100);
    expect(pRate).toBe(8.61);
  });

  it('returns 0 when 0 diners are present', () => {
    expect(calculateDailyPRate(500, 500, 500, 0)).toBe(0);
  });

  it('returns 0 when expenses are 0', () => {
    expect(calculateDailyPRate(0, 0, 0, 50)).toBe(0);
  });
});

describe('deriveStandardBillingCycle', () => {
  it('correctly maps 26th to 25th cycle for May 2026', () => {
    const cycle = deriveStandardBillingCycle(2026, 5);
    expect(cycle.startDate).toBe('2026-04-26');
    expect(cycle.endDate).toBe('2026-05-25');
    expect(cycle.name).toBe('May 2026 Mess Bill');
    expect(cycle.dueDate).toBe('2026-06-10');
  });

  it('correctly crosses year boundary for January 2026', () => {
    const cycle = deriveStandardBillingCycle(2026, 1);
    expect(cycle.startDate).toBe('2025-12-26');
    expect(cycle.endDate).toBe('2026-01-25');
    expect(cycle.name).toBe('January 2026 Mess Bill');
    expect(cycle.dueDate).toBe('2026-02-10');
  });
});

describe('calculateCycleDates', () => {
  it('generates 30 days between April 26 and May 25', () => {
    const dates = calculateCycleDates('2026-04-26', '2026-05-25');
    expect(dates[0]).toBe('2026-04-26');
    expect(dates[dates.length - 1]).toBe('2026-05-25');
    expect(dates.length).toBe(30);
  });
});

describe('calculateMemberMessingCycle', () => {
  const dates = ['2026-05-01', '2026-05-02', '2026-05-03'];

  it('computes messing using P-Register average cost sharing', () => {
    const pRates = new Map<string, number>([
      ['2026-05-01', 80.5],
      ['2026-05-02', 90.0],
      ['2026-05-03', 75.25],
    ]);

    // Member was absent on 2026-05-02
    const result = calculateMemberMessingCycle({
      billingMode: 'P_REGISTER_SPLIT',
      cycleDates: dates,
      isAbsentOnDate: (d) => d === '2026-05-02',
      pRates,
      flatRatesOnDate: () => ({
        breakfast: 0,
        lunch: 0,
        dinner: 0,
        morning_tea: 0,
        evening_tea: 0,
        packed_breakfast: 0,
        packed_lunch: 0,
        packed_dinner: 0,
      }),
      isMealCut: () => false,
    });

    // Expect Day 1 (80.50) + Day 3 (75.25) = 155.75
    expect(result.total).toBe(155.75);
    expect(result.items.length).toBe(2);
  });

  it('computes messing using Flat Rates (Breakfast ₹100, Lunch ₹150, Dinner ₹80) with meal cuts', () => {
    const flatRates: Record<MessingMealType, number> = {
      breakfast: 100,
      lunch: 150,
      dinner: 80,
      morning_tea: 0,
      evening_tea: 0,
      packed_breakfast: 0,
      packed_lunch: 0,
      packed_dinner: 0,
    };

    // Member cut Dinner on 2026-05-01
    const result = calculateMemberMessingCycle({
      billingMode: 'FLAT_RATE',
      cycleDates: ['2026-05-01'],
      isAbsentOnDate: () => false,
      pRates: new Map(),
      flatRatesOnDate: () => flatRates,
      isMealCut: (d, m) => d === '2026-05-01' && m === 'dinner',
    });

    // Daily total without dinner = Breakfast (100) + Lunch (150) = 250
    expect(result.total).toBe(250);
    expect(result.items.length).toBe(2);
    expect(result.items.map((i) => i.description)).toEqual([
      'Messing - BREAKFAST (2026-05-01)',
      'Messing - LUNCH (2026-05-01)',
    ]);
  });
});

const MAY_START = '2026-04-26';
const MAY_END = '2026-05-25';

function barChit(overrides: Partial<BarChitRollupRow>): BarChitRollupRow {
  return {
    id: 'chit-1',
    profile_id: 'officer-101',
    booking_id: null,
    status: 'finalized',
    total_amount: 200,
    date: '2026-05-10',
    ...overrides,
  };
}

describe('bar chit rollup (CP-02 / G-006)', () => {
  it('treats only finalized as a billable bar status', () => {
    expect(BILLABLE_BAR_CHIT_STATUSES).toEqual(['finalized']);
    expect(BILLABLE_BAR_CHIT_STATUSES).not.toContain('signed');
    expect(BILLABLE_BAR_CHIT_STATUSES).not.toContain('pending');
  });

  it('includes finalized member chits and excludes signed, pending, and folio-attached chits', () => {
    const chits = [
      barChit({ id: 'ok', status: 'finalized', profile_id: 'officer-101', booking_id: null }),
      barChit({ id: 'signed-typo', status: 'signed', profile_id: 'officer-101' }),
      barChit({ id: 'pending', status: 'pending', profile_id: 'officer-101' }),
      barChit({
        id: 'guest-folio',
        status: 'finalized',
        profile_id: null,
        booking_id: 'booking-9',
        total_amount: 500,
      }),
      barChit({
        id: 'double-count-risk',
        status: 'finalized',
        profile_id: 'officer-101',
        booking_id: 'booking-9',
        total_amount: 500,
      }),
    ];

    expect(chits.filter(isBillableMemberBarChit).map((c) => c.id)).toEqual(['ok']);

    const grouped = groupMemberBarChits(chits);
    expect(grouped.get('officer-101')).toEqual([{ id: 'ok', amount: 200, date: '2026-05-10' }]);
  });
});

function roomBill(overrides: Partial<HostRoomBillRollupRow> & {
  booking?: HostRoomBillRollupRow['booking'];
}): HostRoomBillRollupRow {
  return {
    id: 'rb-1',
    total_amount: 4500,
    settlement_type: 'CHARGE_TO_HOST',
    status: 'finalized',
    payment_status: 'transferred_to_mess_bill',
    paid_at: null,
    booking: {
      host_profile_id: 'officer-101',
      guest_name: 'Dr. Anita Sharma',
      actual_check_out: '2026-05-15T10:00:00.000Z',
      check_out_date: '2026-05-15',
      room: { name: 'VIP Suite 1' },
    },
    ...overrides,
  };
}

describe('room bill rollup date (CP-04 / G-017)', () => {
  it('prefers actual_check_out, then paid_at, then planned check_out_date — never created_at', () => {
    expect(
      roomBillRollupDate(
        roomBill({
          paid_at: '2026-04-20T00:00:00.000Z',
          booking: {
            host_profile_id: 'officer-101',
            guest_name: 'Guest',
            actual_check_out: '2026-05-15T10:00:00.000Z',
            check_out_date: '2026-04-22',
            room: { name: 'VIP Suite 1' },
          },
        })
      )
    ).toBe('2026-05-15');

    expect(
      roomBillRollupDate(
        roomBill({
          paid_at: '2026-05-18T08:00:00.000Z',
          booking: {
            host_profile_id: 'officer-101',
            guest_name: 'Guest',
            actual_check_out: null,
            check_out_date: '2026-04-22',
            room: { name: 'Deluxe 202' },
          },
        })
      )
    ).toBe('2026-05-18');

    expect(
      roomBillRollupDate(
        roomBill({
          paid_at: null,
          booking: {
            host_profile_id: 'officer-101',
            guest_name: 'Guest',
            actual_check_out: null,
            check_out_date: '2026-05-20',
            room: { name: 'Standard 101' },
          },
        })
      )
    ).toBe('2026-05-20');
  });

  it('assigns a May checkout to the May cycle even when the folio was opened in April', () => {
    const aprilCheckInHostCharge = roomBill({
      id: 'bill-may-checkout',
      booking: {
        host_profile_id: 'officer-101',
        guest_name: 'Dr. Anita Sharma',
        actual_check_out: '2026-05-15T10:00:00.000Z',
        check_out_date: '2026-05-15',
        room: { name: 'VIP Suite 1' },
      },
    });

    const grouped = groupHostChargeRoomBills([aprilCheckInHostCharge], MAY_START, MAY_END);
    expect(grouped.get('officer-101')?.map((b) => b.id)).toEqual(['bill-may-checkout']);

    const aprilCycle = groupHostChargeRoomBills(
      [aprilCheckInHostCharge],
      '2026-03-26',
      '2026-04-25'
    );
    expect(aprilCycle.size).toBe(0);
  });
});

describe('room bill host routing (CP-07 / G-018)', () => {
  it('rolls up only CHARGE_TO_HOST + transferred_to_mess_bill via host_profile_id', () => {
    const bills: HostRoomBillRollupRow[] = [
      roomBill({ id: 'host-charge' }),
      roomBill({
        id: 'direct-with-host',
        total_amount: 2800,
        settlement_type: 'DIRECT_SETTLEMENT',
        payment_status: 'paid',
        paid_at: '2026-05-18T12:00:00.000Z',
        booking: {
          host_profile_id: 'officer-101',
          guest_name: 'Capt Rohan',
          actual_check_out: '2026-05-18T12:00:00.000Z',
          check_out_date: '2026-05-18',
          room: { name: 'Deluxe 202' },
        },
      }),
      roomBill({
        id: 'draft-folio',
        payment_status: 'draft',
        status: 'draft',
        booking: {
          host_profile_id: 'officer-101',
          guest_name: 'Not checked out',
          actual_check_out: null,
          check_out_date: '2026-05-20',
          room: { name: 'Standard 101' },
        },
      }),
      roomBill({
        id: 'booked-by-only',
        booking: {
          host_profile_id: null,
          guest_name: 'Clerk booked this',
          actual_check_out: '2026-05-16T10:00:00.000Z',
          check_out_date: '2026-05-16',
          room: { name: 'Suite 3' },
        },
      }),
      roomBill({
        id: 'officer-102',
        total_amount: 3200,
        booking: {
          host_profile_id: 'officer-102',
          guest_name: 'Brigadier S. Roy',
          actual_check_out: '2026-05-22T09:00:00.000Z',
          check_out_date: '2026-05-22',
          room: { name: 'Suite 3' },
        },
      }),
    ];

    expect(isHostChargeRoomBill(bills[0])).toBe(true);
    expect(isHostChargeRoomBill(bills[1])).toBe(false);
    expect(isHostChargeRoomBill(bills[2])).toBe(false);
    expect(isHostChargeRoomBill(bills[3])).toBe(false);

    const grouped = groupHostChargeRoomBills(bills, MAY_START, MAY_END);
    expect(grouped.get('officer-101')?.map((b) => b.id)).toEqual(['host-charge']);
    expect(grouped.get('officer-101')?.[0].amount).toBe(4500);
    expect(grouped.get('officer-102')?.map((b) => b.id)).toEqual(['officer-102']);
    expect(grouped.has('clerk-id')).toBe(false);
  });

  it('accepts transferred_to_mess_bill on unified status after schema merge', () => {
    const merged = roomBill({
      id: 'merged-status',
      status: 'transferred_to_mess_bill',
      payment_status: null,
    });
    expect(isHostChargeRoomBill(merged)).toBe(true);
    expect(groupHostChargeRoomBills([merged], MAY_START, MAY_END).get('officer-101')?.[0].id).toBe(
      'merged-status'
    );
  });
});
