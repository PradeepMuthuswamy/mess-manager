import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

// Operational state only. Occupancy is derived from bookings; never set
// 'occupied' on a room — it's computed by `public.v_rooms_current`.
export const roomStatusSchema = z.enum(['available', 'maintenance', 'out_of_service']);
export const bookingStatusSchema = z.enum(['confirmed', 'checked_in', 'checked_out', 'cancelled']);
export const billStatusSchema = z.enum(['draft', 'finalized', 'paid']);
export const billItemCategorySchema = z.enum(['room_rent', 'food', 'adhoc', 'misc', 'bar']);
export const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner']);
export const furnitureKindSchema = z.enum(['furniture', 'fixture', 'equipment', 'other']);
export const furnitureConditionSchema = z.enum(['good', 'fair', 'poor']);

export const bookingCategoryEnum = [
  'MEMBER_GUEST',
  'TRANSIT_OFFICER',
  'OFFICIAL_DELEGATION',
  'OUTSIDE_CIVILIAN',
] as const;
export const bookingCategorySchema = z.enum(bookingCategoryEnum);
export type BookingCategory = (typeof bookingCategoryEnum)[number];

export const settlementTypeEnum = ['DIRECT_SETTLEMENT', 'CHARGE_TO_HOST'] as const;
export const settlementTypeSchema = z.enum(settlementTypeEnum);
export type SettlementType = (typeof settlementTypeEnum)[number];

export const roomBillPaymentStatusEnum = ['draft', 'paid', 'transferred_to_mess_bill'] as const;
export const roomBillPaymentStatusSchema = z.enum(roomBillPaymentStatusEnum);
export type RoomBillPaymentStatus = (typeof roomBillPaymentStatusEnum)[number];

export const createFurnitureItemSchema = z.object({
  unit_id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  kind: furnitureKindSchema.default('furniture'),
}).openapi('CreateFurnitureItemInput');

export const roomInventoryRowSchema = z.object({
  furniture_id: z.string().uuid(),
  quantity: z.coerce.number().int().positive().default(1),
  condition: furnitureConditionSchema.default('good'),
  notes: z.string().trim().max(500).nullable().optional(),
}).openapi('RoomInventoryRow');

export const createRoomSchema = z.object({
  unit_id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  room_type: z.enum(['Standard', 'Deluxe', 'Executive', 'Suite', 'VIP']).default('Standard'),
  nightly_rate: z.coerce.number().nonnegative().default(0),
  status: roomStatusSchema.default('available'),
  inventory: z.array(roomInventoryRowSchema).optional(),
}).openapi('CreateRoomInput');

export const updateRoomSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  room_type: z.enum(['Standard', 'Deluxe', 'Executive', 'Suite', 'VIP']).optional(),
  nightly_rate: z.coerce.number().nonnegative().optional(),
  status: roomStatusSchema.optional(),
  inventory: z.array(roomInventoryRowSchema).optional(),
}).openapi('UpdateRoomInput');

export const createBookingSchema = z.object({
  unit_id: z.string().uuid(),
  room_id: z.string().uuid(),
  guest_name: z.string().trim().min(1).max(200),
  guest_rank: z.string().trim().max(50).optional(),
  guest_phone: z.string().trim().max(30).nullable().optional(),
  guest_email: z.string().trim().nullable().optional(),
  check_in_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  check_out_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  status: bookingStatusSchema.default('confirmed'),
  booking_category: bookingCategorySchema.default('MEMBER_GUEST'),
  host_profile_id: z.string().uuid().nullable().optional(),
  settlement_type: settlementTypeSchema.default('DIRECT_SETTLEMENT'),
  special_requests: z.string().trim().max(500).nullable().optional(),
}).openapi('CreateBookingInput').refine(data => {
  return new Date(data.check_out_date) > new Date(data.check_in_date);
}, {
  message: "Check-out date must be after check-in date",
  path: ["check_out_date"],
});

export const updateBookingSchema = z.object({
  room_id: z.string().uuid().optional(),
  guest_name: z.string().trim().min(1).max(200).optional(),
  guest_rank: z.string().trim().max(50).optional(),
  guest_phone: z.string().trim().max(30).nullable().optional(),
  guest_email: z.string().trim().nullable().optional(),
  check_in_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  check_out_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  actual_check_in: z.string().datetime().nullable().optional(),
  actual_check_out: z.string().datetime().nullable().optional(),
  status: bookingStatusSchema.optional(),
  booking_category: bookingCategorySchema.optional(),
  host_profile_id: z.string().uuid().nullable().optional(),
  settlement_type: settlementTypeSchema.optional(),
  special_requests: z.string().trim().max(500).nullable().optional(),
}).openapi('UpdateBookingInput');

export const checkOutBookingSchema = z.object({
  booking_id: z.string().uuid(),
  settlement_type: settlementTypeSchema.default('DIRECT_SETTLEMENT'),
  payment_method: z.string().trim().optional().nullable(),
  payment_reference: z.string().trim().optional().nullable(),
  paid_amount: z.coerce.number().min(0).optional(),
}).openapi('CheckOutBookingInput');

export const createBillItemSchema = z.object({
  category: billItemCategorySchema,
  description: z.string().trim().min(1).max(500),
  amount: z.coerce.number(),
  quantity: z.coerce.number().positive().default(1),
  variant_id: z.string().uuid().nullable().optional(),
  meal_type: mealTypeSchema.nullable().optional(),
  order_id: z.string().uuid().nullable().optional(),
}).openapi('CreateBillItemInput');

export const createBillOrderSchema = z.object({
  bill_id: z.string().uuid(),
  label: z.string().trim().min(1).max(200),
  occurred_at: z.string().datetime().optional(),
  note: z.string().trim().max(500).nullable().optional(),
}).openapi('CreateBillOrderInput');

export const finalizeBillSchema = z.object({
  status: z.enum(['finalized', 'paid']),
}).openapi('FinalizeBillInput');

export const roomTypeSchema = z.object({
  unit_id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  rate: z.coerce.number().nonnegative(),
});

export type CreateFurnitureItemInput = z.infer<typeof createFurnitureItemSchema>;
export type RoomInventoryRow = z.infer<typeof roomInventoryRowSchema>;
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;
export type CheckOutBookingInput = z.infer<typeof checkOutBookingSchema>;
export type CreateBillItemInput = z.infer<typeof createBillItemSchema>;
export type CreateBillOrderInput = z.infer<typeof createBillOrderSchema>;
export type FinalizeBillInput = z.infer<typeof finalizeBillSchema>;
export type RoomTypeInput = z.infer<typeof roomTypeSchema>;

/** Folio food total from unit tariff (`units.guest_food_per_night`), not a hardcoded 900. */
export function guestFoodAmount(nights: number, ratePerNight: number): number {
  return nights * ratePerNight;
}
