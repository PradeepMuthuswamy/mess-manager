import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const messingBillingModeEnum = ['FLAT_RATE', 'P_REGISTER_SPLIT'] as const;
export const messingMealTypeEnum = [
  'breakfast',
  'morning_tea',
  'lunch',
  'evening_tea',
  'dinner',
  'packed_breakfast',
  'packed_lunch',
  'packed_dinner',
] as const;

export type MessingBillingMode = (typeof messingBillingModeEnum)[number];
export type MessingMealType = (typeof messingMealTypeEnum)[number];

export const MESSING_MEAL_TYPE_LABEL: Record<MessingMealType, string> = {
  breakfast: 'Breakfast',
  morning_tea: 'Morning Tea',
  lunch: 'Lunch',
  evening_tea: 'Evening Tea',
  dinner: 'Dinner',
  packed_breakfast: 'Packed Breakfast',
  packed_lunch: 'Packed Lunch',
  packed_dinner: 'Packed Dinner',
};

export const messingBillingModeSchema = z.enum(messingBillingModeEnum);
export const messingMealTypeSchema = z.enum(messingMealTypeEnum);

export const flatRateInputSchema = z.object({
  meal_type: messingMealTypeSchema,
  rate: z.coerce.number().min(0),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const updateUnitFlatRatesSchema = z.object({
  unit_id: z.string().uuid(),
  rates: z.array(flatRateInputSchema).min(1),
}).openapi('UpdateUnitFlatRatesInput');

export const dailyKitchenExpenditureSchema = z.object({
  unit_id: z.string().uuid(),
  expenditure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  morning_amount: z.coerce.number().min(0).default(0),
  afternoon_amount: z.coerce.number().min(0).default(0),
  dinner_amount: z.coerce.number().min(0).default(0),
  notes: z.string().trim().optional().nullable(),
  receipt_ref: z.string().trim().optional().nullable(),
  vendor_name: z.string().trim().optional().nullable(),
  sourcing_category: z.enum(['LOCAL_PURCHASE', 'CANTEEN', 'OTHER']).default('LOCAL_PURCHASE'),
}).openapi('DailyKitchenExpenditureInput');

export const mealCutInputSchema = z.object({
  unit_id: z.string().uuid(),
  cut_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meal_type: messingMealTypeSchema,
  profile_id: z.string().uuid().optional(),
  reason: z.string().trim().max(300).optional().nullable(),
}).openapi('MealCutInput');

export const guestMealInputSchema = z.object({
  unit_id: z.string().uuid(),
  host_profile_id: z.string().uuid(),
  meal_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meal_type: messingMealTypeSchema,
  guest_count: z.coerce.number().int().min(1).default(1),
  guest_names: z.string().trim().optional().nullable(),
  rate_charged: z.coerce.number().min(0),
  notes: z.string().trim().optional().nullable(),
}).openapi('GuestMealInput');

export const approveMealCutSchema = z.object({
  id: z.string().uuid(),
  unit_id: z.string().uuid(),
}).openapi('ApproveMealCutInput');

export const rejectMealCutSchema = z.object({
  id: z.string().uuid(),
  unit_id: z.string().uuid(),
  reason: z.string().trim().max(300).optional().nullable(),
}).openapi('RejectMealCutInput');

const registerDateFields = {
  unit_id: z.string().uuid(),
  expenditure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
};

export const submitDailyRegisterSchema = z.object(registerDateFields).openapi('SubmitDailyRegisterInput');

export const approveDailyRegisterSchema = z.object(registerDateFields).openapi('ApproveDailyRegisterInput');

export const rejectDailyRegisterSchema = z
  .object({
    ...registerDateFields,
    reject_reason: z.string().trim().max(500).optional().nullable(),
  })
  .openapi('RejectDailyRegisterInput');

export type FlatRateInput = z.infer<typeof flatRateInputSchema>;
export type UpdateUnitFlatRatesInput = z.infer<typeof updateUnitFlatRatesSchema>;
export type DailyKitchenExpenditureInput = z.infer<typeof dailyKitchenExpenditureSchema>;
export type MealCutInput = z.infer<typeof mealCutInputSchema>;
export type GuestMealInput = z.infer<typeof guestMealInputSchema>;
export type ApproveMealCutInput = z.infer<typeof approveMealCutSchema>;
export type RejectMealCutInput = z.infer<typeof rejectMealCutSchema>;
export type SubmitDailyRegisterInput = z.infer<typeof submitDailyRegisterSchema>;
export type ApproveDailyRegisterInput = z.infer<typeof approveDailyRegisterSchema>;
export type RejectDailyRegisterInput = z.infer<typeof rejectDailyRegisterSchema>;
