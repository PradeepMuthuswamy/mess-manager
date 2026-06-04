import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { uomSchema } from './items';

extendZodWithOpenApi(z);

export const rationClassEnum = ['officer', 'jco', 'or', 'civilian'] as const;
export const rationTerrainEnum = [
  'plains',
  'desert',
  'high_altitude',
  'field',
  'sea',
] as const;

export type RationClass = (typeof rationClassEnum)[number];
export type RationTerrain = (typeof rationTerrainEnum)[number];

export const rationClassSchema = z.enum(rationClassEnum);
export const rationTerrainSchema = z.enum(rationTerrainEnum);

export const RATION_CLASS_LABEL: Record<RationClass, string> = {
  officer: 'Officers',
  jco: 'JCOs',
  or: 'OR',
  civilian: 'Civilians',
};

export const RATION_TERRAIN_LABEL: Record<RationTerrain, string> = {
  plains: 'Plains',
  desert: 'Desert',
  high_altitude: 'High Altitude',
  field: 'Field',
  sea: 'Sea',
};

export const createScaleSchema = z
  .object({
    unit_id: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    rank_class: rationClassSchema,
    terrain: rationTerrainSchema,
    description: z.string().trim().max(500).optional(),
  })
  .openapi('CreateRationScaleInput');

export const updateScaleSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).optional(),
    is_active: z.boolean().optional(),
  })
  .openapi('UpdateRationScaleInput');

export const upsertScaleItemSchema = z
  .object({
    item_id: z.string().uuid(),
    auth_qty: z.coerce.number().nonnegative(),
    uom: uomSchema,
    notes: z.string().trim().max(500).optional(),
    effective_at: z.coerce.date().optional(),
  })
  .openapi('UpsertRationScaleItemInput');

export const bulkUpdateScaleItemsSchema = z
  .object({
    scale_id: z.string().uuid(),
    item_ids: z.array(z.string().uuid()).min(1).max(200),
    operation: z.enum(['set', 'multiply', 'add_percent']),
    value: z.coerce.number().refine((n) => Number.isFinite(n)),
    notes: z.string().trim().max(500).optional(),
  })
  .openapi('BulkUpdateScaleItemsInput');

export const listScalesQuerySchema = z
  .object({
    unit_id: z.string().uuid().optional(),
    rank_class: rationClassSchema.optional(),
    terrain: rationTerrainSchema.optional(),
    q: z.string().trim().min(1).max(100).optional(),
    active_only: z.coerce.boolean().default(true),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .openapi('ListRationScalesQuery');

export type CreateScaleInput = z.infer<typeof createScaleSchema>;
export type UpdateScaleInput = z.infer<typeof updateScaleSchema>;
export type UpsertScaleItemInput = z.infer<typeof upsertScaleItemSchema>;
export type BulkUpdateScaleItemsInput = z.infer<typeof bulkUpdateScaleItemsSchema>;
export type ListScalesQuery = z.infer<typeof listScalesQuerySchema>;
