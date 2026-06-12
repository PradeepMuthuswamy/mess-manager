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

export type FlatRateInput = z.infer<typeof flatRateInputSchema>;
export type UpdateUnitFlatRatesInput = z.infer<typeof updateUnitFlatRatesSchema>;
