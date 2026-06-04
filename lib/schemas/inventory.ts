import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const createLotSchema = z.object({
  unit_id: z.string().uuid(),
  item_id: z.string().uuid(),
  pack_size_id: z.string().uuid(),
  qty_packs: z.coerce.number().nonnegative(),
  rate: z.coerce.number().nonnegative(),
  acquired_on: z.coerce.date().nullable().optional(),
  source: z.string().trim().max(120).nullable().optional(),
}).openapi('CreateLotInput');

export const updateLotSchema = z.object({
  pack_size_id: z.string().uuid().optional(),
  rate: z.coerce.number().nonnegative().optional(),
  acquired_on: z.coerce.date().nullable().optional(),
  source: z.string().trim().max(120).nullable().optional(),
  is_active: z.boolean().optional(),
}).openapi('UpdateLotInput');

export const adjustQtySchema = z.object({
  id: z.string().uuid(),
  qty_packs: z.coerce.number().nonnegative(),
}).openapi('AdjustQtyInput');

export const createPackSizeSchema = z.object({
  label: z.string().trim().min(1).max(60),
  kind: z.enum(['volume','count']),
  volume_ml: z.coerce.number().positive().nullable().optional(),
  unit_count: z.coerce.number().int().positive().nullable().optional(),
  sort_order: z.coerce.number().int().default(0),
}).superRefine((val, ctx) => {
  // Mirror the DB constraint pack_sizes_kind_facet:
  //   kind 'volume' => volume_ml present, unit_count empty
  //   kind 'count'  => unit_count present, volume_ml empty
  if (val.kind === 'volume') {
    if (val.volume_ml == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['volume_ml'],
        message: "volume_ml is required when kind is 'volume'",
      });
    }
    if (val.unit_count != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['unit_count'],
        message: "unit_count must be empty when kind is 'volume'",
      });
    }
  } else {
    if (val.unit_count == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['unit_count'],
        message: "unit_count is required when kind is 'count'",
      });
    }
    if (val.volume_ml != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['volume_ml'],
        message: "volume_ml must be empty when kind is 'count'",
      });
    }
  }
}).openapi('CreatePackSizeInput');

export const listInventoryQuerySchema = z.object({
  unit_id: z.string().uuid().optional(),
  q: z.string().trim().min(1).max(100).optional(),
  item_id: z.string().uuid().optional(),
  include_inactive: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).openapi('ListInventoryQuery');

export type CreateLotInput = z.infer<typeof createLotSchema>;
export type UpdateLotInput = z.infer<typeof updateLotSchema>;
export type AdjustQtyInput = z.infer<typeof adjustQtySchema>;
export type CreatePackSizeInput = z.infer<typeof createPackSizeSchema>;
export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;
