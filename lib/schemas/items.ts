import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const itemCategorySchema = z.enum(['ration','soft_drink','alcohol','cigar','grocery']);
export const uomSchema = z.enum(['kg','g','l','ml','piece','pack','bottle']);

export const unitTypeSchema = z.enum(['ML', 'LITRE', 'GRAM', 'KG', 'PIECE']);
export const packageTypeSchema = z.enum(['BOTTLE', 'CAN', 'PACKET', 'BOX', 'LOOSE']);

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const createProductSchema = z.object({
  category_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).optional().nullable(),
}).openapi('CreateProductInput');

export const updateProductSchema = z.object({
  category_id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  is_active: z.boolean().optional(),
}).openapi('UpdateProductInput');

export const createVariantSchema = z.object({
  product_id: z.string().uuid().optional(), // optional when created inline with product
  unit_value: z.coerce.number().positive(),
  unit_type: unitTypeSchema,
  package_type: packageTypeSchema,
  sku: z.string().trim().max(50).optional().nullable(),
}).openapi('CreateVariantInput');

export const updateVariantSchema = z.object({
  unit_value: z.coerce.number().positive().optional(),
  unit_type: unitTypeSchema.optional(),
  package_type: packageTypeSchema.optional(),
  sku: z.string().trim().max(50).optional().nullable(),
  is_active: z.boolean().optional(),
}).openapi('UpdateVariantInput');

export const listItemsQuerySchema = z.object({
  category: itemCategorySchema,
  unit_id: z.string().uuid().nullable().optional(),
  q: z.string().trim().min(1).max(100).optional(),
  active_only: z.coerce.boolean().default(true),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  sort: z.enum(['name','-name','created_at','-created_at','updated_at','-updated_at']).default('-updated_at'),
}).openapi('ListItemsQuery');

export const createItemApiSchema = createProductSchema.extend({
  variant: createVariantSchema.omit({ product_id: true }),
}).openapi('CreateItemApiInput');

export const adoptVariantSchema = z.object({
  unit_id: z.string().uuid(),
  variant_id: z.string().uuid(),
  local_sku: z.string().trim().max(50).optional().nullable(),
}).openapi('AdoptVariantInput');

export const unadoptVariantSchema = z.object({
  unit_id: z.string().uuid(),
  variant_id: z.string().uuid(),
  hard: z.boolean().optional().default(false),
}).openapi('UnadoptVariantInput');

export const setUnitMenuRateSchema = z.object({
  unit_id: z.string().uuid(),
  variant_id: z.string().uuid(),
  rate: z.coerce.number().nonnegative(),
  effective_from: isoDateSchema,
}).openapi('SetUnitMenuRateInput');

export const updateUnitCatalogSchema = z.object({
  unit_id: z.string().uuid(),
  variant_id: z.string().uuid(),
  local_sku: z.string().trim().max(50).optional().nullable(),
  is_enabled: z.boolean().optional(),
}).openapi('UpdateUnitCatalogInput');

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;
export type CreateItemApiInput = z.infer<typeof createItemApiSchema>;
export type AdoptVariantInput = z.infer<typeof adoptVariantSchema>;
export type UnadoptVariantInput = z.infer<typeof unadoptVariantSchema>;
export type SetUnitMenuRateInput = z.infer<typeof setUnitMenuRateSchema>;
export type UpdateUnitCatalogInput = z.infer<typeof updateUnitCatalogSchema>;
