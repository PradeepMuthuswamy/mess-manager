import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const itemCategorySchema = z.enum(['ration','soft_drink','alcohol','cigar','grocery']);
export const uomSchema = z.enum(['kg','g','l','ml','piece','pack','bottle']);

export const createItemSchema = z.object({
  unit_id: z.string().uuid().nullable().optional(),   // null = global
  category: itemCategorySchema,
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().max(50).optional(),
  uom: uomSchema,
  initial_rate: z.coerce.number().nonnegative().default(0),
  initial_ration_scale: z.coerce.number().nonnegative().optional(),
  notes: z.string().trim().max(500).optional(),
}).openapi('CreateItemInput');

export const updateItemSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  sku: z.string().trim().max(50).optional(),
  uom: uomSchema.optional(),
  is_active: z.boolean().optional(),
}).openapi('UpdateItemInput');

export const newItemVersionSchema = z.object({
  rate: z.coerce.number().nonnegative(),
  ration_scale: z.coerce.number().nonnegative().optional(),
  notes: z.string().trim().max(500).optional(),
  effective_at: z.coerce.date().optional(),
}).openapi('NewItemVersionInput');

export const listItemsQuerySchema = z.object({
  category: itemCategorySchema,
  unit_id: z.string().uuid().nullable().optional(),
  q: z.string().trim().min(1).max(100).optional(),
  active_only: z.coerce.boolean().default(true),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  sort: z.enum(['name','-name','created_at','-created_at','updated_at','-updated_at']).default('-updated_at'),
}).openapi('ListItemsQuery');

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type NewItemVersionInput = z.infer<typeof newItemVersionSchema>;
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;
