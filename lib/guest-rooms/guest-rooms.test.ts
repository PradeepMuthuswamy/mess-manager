import { describe, expect, it } from 'vitest';
import {
  createBookingSchema,
  checkOutBookingSchema,
  createBillItemSchema,
  billItemCategorySchema,
  bookingCategoryEnum,
  settlementTypeEnum,
  guestFoodAmount,
} from '@/lib/schemas/guest-rooms';

describe('Guest Rooms Schemas & SaaS Enhancements', () => {
  it('validates booking categories', () => {
    expect(bookingCategoryEnum).toContain('MEMBER_GUEST');
    expect(bookingCategoryEnum).toContain('TRANSIT_OFFICER');
    expect(bookingCategoryEnum).toContain('OFFICIAL_DELEGATION');
    expect(bookingCategoryEnum).toContain('OUTSIDE_CIVILIAN');
  });

  it('validates settlement types', () => {
    expect(settlementTypeEnum).toContain('DIRECT_SETTLEMENT');
    expect(settlementTypeEnum).toContain('CHARGE_TO_HOST');
  });

  it('parses valid booking with member guest and charge to host', () => {
    const input = {
      unit_id: 'a0000000-0000-4000-8000-000000000001',
      room_id: 'b0000000-0000-4000-8000-000000000002',
      guest_name: 'Col Rajesh Kumar',
      guest_rank: 'Col',
      guest_phone: '+919876543210',
      guest_email: 'rajesh@example.com',
      check_in_date: '2026-06-01',
      check_out_date: '2026-06-05',
      booking_category: 'MEMBER_GUEST',
      host_profile_id: 'c0000000-0000-4000-8000-000000000003',
      settlement_type: 'CHARGE_TO_HOST',
      special_requests: 'Requires VIP protocol and extra mattress',
    };

    const parsed = createBookingSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.booking_category).toBe('MEMBER_GUEST');
      expect(parsed.data.settlement_type).toBe('CHARGE_TO_HOST');
      expect(parsed.data.host_profile_id).toBe('c0000000-0000-4000-8000-000000000003');
      expect(parsed.data.special_requests).toBe('Requires VIP protocol and extra mattress');
    }
  });

  it('parses transit officer booking with direct settlement default', () => {
    const input = {
      unit_id: 'a0000000-0000-4000-8000-000000000001',
      room_id: 'b0000000-0000-4000-8000-000000000002',
      guest_name: 'Maj Vivek Sharma',
      guest_rank: 'Major',
      check_in_date: '2026-06-10',
      check_out_date: '2026-06-12',
      booking_category: 'TRANSIT_OFFICER',
    };

    const parsed = createBookingSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.booking_category).toBe('TRANSIT_OFFICER');
      expect(parsed.data.settlement_type).toBe('DIRECT_SETTLEMENT');
      expect(parsed.data.host_profile_id).toBeUndefined();
    }
  });

  it('rejects booking when check-out date is before or equal to check-in date', () => {
    const input = {
      unit_id: 'a0000000-0000-4000-8000-000000000001',
      room_id: 'b0000000-0000-4000-8000-000000000002',
      guest_name: 'Capt Arjun',
      check_in_date: '2026-06-10',
      check_out_date: '2026-06-10',
    };

    const parsed = createBookingSchema.safeParse(input);
    expect(parsed.success).toBe(false);
  });

  it('parses checkout input with payment details', () => {
    const input = {
      booking_id: 'd0000000-0000-4000-8000-000000000004',
      settlement_type: 'DIRECT_SETTLEMENT',
      payment_method: 'upi',
      payment_reference: 'UPI/20260612/89342',
      paid_amount: 3600,
    };

    const parsed = checkOutBookingSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.settlement_type).toBe('DIRECT_SETTLEMENT');
      expect(parsed.data.payment_method).toBe('upi');
      expect(parsed.data.payment_reference).toBe('UPI/20260612/89342');
      expect(parsed.data.paid_amount).toBe(3600);
    }
  });

  it('parses checkout with only booking_id; payment fields stay optional', () => {
    const parsed = checkOutBookingSchema.safeParse({
      booking_id: 'd0000000-0000-4000-8000-000000000004',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.booking_id).toBe('d0000000-0000-4000-8000-000000000004');
      expect(parsed.data.settlement_type).toBe('DIRECT_SETTLEMENT');
      expect(parsed.data.paid_amount).toBeUndefined();
      expect(parsed.data.payment_method).toBeUndefined();
      expect(parsed.data.payment_reference).toBeUndefined();
    }
  });

  it('parses CHARGE_TO_HOST checkout without payment fields', () => {
    const parsed = checkOutBookingSchema.safeParse({
      booking_id: 'd0000000-0000-4000-8000-000000000004',
      settlement_type: 'CHARGE_TO_HOST',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.settlement_type).toBe('CHARGE_TO_HOST');
      expect(parsed.data.paid_amount).toBeUndefined();
    }
  });
});

describe('Bill item categories', () => {
  it('includes bar alongside rent, food, adhoc, and misc', () => {
    expect(billItemCategorySchema.options).toEqual(
      expect.arrayContaining(['room_rent', 'food', 'adhoc', 'misc', 'bar']),
    );
  });

  it('parses a bar folio line', () => {
    const parsed = createBillItemSchema.safeParse({
      category: 'bar',
      description: 'Bar chit — 12 Jun',
      amount: 1450,
      quantity: 1,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.category).toBe('bar');
      expect(parsed.data.amount).toBe(1450);
    }
  });

  it('rejects an unknown bill item category', () => {
    const parsed = createBillItemSchema.safeParse({
      category: 'laundry',
      description: 'Laundry',
      amount: 200,
    });

    expect(parsed.success).toBe(false);
  });
});

describe('guestFoodAmount — unit food tariff, not a hardcoded 900', () => {
  it('multiplies nights by the unit guest_food_per_night rate', () => {
    const unitFoodRate = 750;
    expect(guestFoodAmount(4, unitFoodRate)).toBe(3000);
  });

  it('uses whatever rate the unit configured, including the default 900', () => {
    expect(guestFoodAmount(3, 900)).toBe(2700);
    expect(guestFoodAmount(2, 1200)).toBe(2400);
  });

  it('returns 0 when nights or rate is 0', () => {
    expect(guestFoodAmount(0, 900)).toBe(0);
    expect(guestFoodAmount(5, 0)).toBe(0);
  });
});

describe('Settlement Routing & Monthly Mess Billing Separation', () => {
  interface SimulatedRoomBill {
    id: string;
    total_amount: number;
    settlement_type: 'DIRECT_SETTLEMENT' | 'CHARGE_TO_HOST';
    booking: {
      id: string;
      host_profile_id: string | null;
      guest_name: string;
      check_out_date: string;
      room: { name: string };
    };
  }

  it('correctly aggregates ONLY CHARGE_TO_HOST bills to member accounts and excludes DIRECT_SETTLEMENT', () => {
    const simulatedBills: SimulatedRoomBill[] = [
      {
        id: 'bill-1',
        total_amount: 4500,
        settlement_type: 'CHARGE_TO_HOST',
        booking: {
          id: 'booking-1',
          host_profile_id: 'officer-101',
          guest_name: 'Dr. Anita Sharma',
          check_out_date: '2026-05-15',
          room: { name: 'VIP Suite 1' },
        },
      },
      {
        id: 'bill-2',
        total_amount: 2800,
        settlement_type: 'DIRECT_SETTLEMENT', // Guest paid cash at departure
        booking: {
          id: 'booking-2',
          host_profile_id: 'officer-101', // Officer hosted but guest paid
          guest_name: 'Capt Rohan',
          check_out_date: '2026-05-18',
          room: { name: 'Deluxe 202' },
        },
      },
      {
        id: 'bill-3',
        total_amount: 1900,
        settlement_type: 'DIRECT_SETTLEMENT', // Transit officer direct payment
        booking: {
          id: 'booking-3',
          host_profile_id: null,
          guest_name: 'Lt Col Pradeep (Transit)',
          check_out_date: '2026-05-20',
          room: { name: 'Standard 101' },
        },
      },
      {
        id: 'bill-4',
        total_amount: 3200,
        settlement_type: 'CHARGE_TO_HOST',
        booking: {
          id: 'booking-4',
          host_profile_id: 'officer-102',
          guest_name: 'Brigadier S. Roy',
          check_out_date: '2026-05-22',
          room: { name: 'Suite 3' },
        },
      },
    ];

    // Simulate the monthly billing aggregation engine
    const memberRoomBills = new Map<
      string,
      Array<{ id: string; roomName: string; guestName: string; amount: number; date: string }>
    >();

    for (const rb of simulatedBills) {
      // In runMonthlyBillingAction, the query filters .eq('settlement_type', 'CHARGE_TO_HOST')
      if (rb.settlement_type === 'CHARGE_TO_HOST' && rb.booking.host_profile_id) {
        const list = memberRoomBills.get(rb.booking.host_profile_id) ?? [];
        list.push({
          id: rb.id,
          roomName: rb.booking.room.name,
          guestName: rb.booking.guest_name,
          amount: rb.total_amount,
          date: rb.booking.check_out_date,
        });
        memberRoomBills.set(rb.booking.host_profile_id, list);
      }
    }

    // Officer 101 should only be billed ₹4500 (bill-1), NOT bill-2 (₹2800 paid directly by guest)
    const officer101Bills = memberRoomBills.get('officer-101') ?? [];
    expect(officer101Bills.length).toBe(1);
    expect(officer101Bills[0].id).toBe('bill-1');
    expect(officer101Bills[0].amount).toBe(4500);

    // Officer 102 should be billed ₹3200 (bill-4)
    const officer102Bills = memberRoomBills.get('officer-102') ?? [];
    expect(officer102Bills.length).toBe(1);
    expect(officer102Bills[0].amount).toBe(3200);

    // Transit officer direct payment bill-3 was never attached to any member
    expect(memberRoomBills.has('null')).toBe(false);
  });
});
