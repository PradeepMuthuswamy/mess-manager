import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

// Operational state only. Occupancy is derived from bookings; never set
// 'occupied' on a room — it's computed by `public.v_rooms_current`.
export const roomStatusSchema = z.enum(['available', 'maintenance', 'out_of_service']);
export const bookingStatusSchema = z.enum(['confirmed', 'checked_in', 'checked_out', 'cancelled']);
export const billStatusSchema = z.enum(['draft', 'finalized', 'paid']);
export const billItemCategorySchema = z.enum(['room_rent', 'food', 'adhoc', 'misc']);
export const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner']);
export const furnitureKindSchema = z.enum(['furniture', 'fixture', 'equipment', 'other']);
export const furnitureConditionSchema = z.enum(['good', 'fair', 'poor']);

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
  check_in_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  check_out_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  status: bookingStatusSchema.default('confirmed'),
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
  check_in_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  check_out_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  actual_check_in: z.string().datetime().nullable().optional(),
  actual_check_out: z.string().datetime().nullable().optional(),
  status: bookingStatusSchema.optional(),
}).openapi('UpdateBookingInput');

export const createBillItemSchema = z.object({
  category: billItemCategorySchema,
  description: z.string().trim().min(1).max(500),
  amount: z.coerce.number(),
  quantity: z.coerce.number().positive().default(1),
  item_id: z.string().uuid().nullable().optional(),
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
}).openapi('RoomTypeInput');

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;
export type CreateBillItemInput = z.infer<typeof createBillItemSchema>;
export type CreateBillOrderInput = z.infer<typeof createBillOrderSchema>;
export type FinalizeBillInput = z.infer<typeof finalizeBillSchema>;
export type CreateFurnitureItemInput = z.infer<typeof createFurnitureItemSchema>;
export type RoomInventoryRow = z.infer<typeof roomInventoryRowSchema>;
export type RoomTypeInput = z.infer<typeof roomTypeSchema>;
