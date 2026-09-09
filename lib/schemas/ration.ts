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

export const rationStockTxTypeEnum = [
  'receipt',
  'adjustment',
  'return_to_source',
  'consumption',
] as const;

export const rationStockSourceEnum = [
  'canteen',
  'local',
  'govt_issue',
  'other',
] as const;

export type RationStockTxType = (typeof rationStockTxTypeEnum)[number];
export type RationStockSource = (typeof rationStockSourceEnum)[number];

export const rationStockTxTypeSchema = z.enum(rationStockTxTypeEnum);
export const rationStockSourceSchema = z.enum(rationStockSourceEnum);

export const RATION_STOCK_TX_TYPE_LABEL: Record<RationStockTxType, string> = {
  receipt: 'Receipt',
  adjustment: 'Adjustment',
  return_to_source: 'Return to Source',
  consumption: 'Consumption',
};

export const RATION_STOCK_SOURCE_LABEL: Record<RationStockSource, string> = {
  canteen: 'Canteen',
  local: 'Local',
  govt_issue: 'Govt Issue',
  other: 'Other',
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

export const dailyConsumptionInputSchema = z.object({
  variant_id: z.string().uuid(),
  quantity: z.coerce.number().nonnegative(),
});

export const saveDailyConsumptionSchema = z.object({
  unit_id: z.string().uuid(),
  consumption_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(dailyConsumptionInputSchema),
});

const optionalStockSourceSchema = z.preprocess(
  (val) => (val === '' || val == null ? undefined : val),
  rationStockSourceSchema.optional(),
);

export const createRationStockTransactionSchema = z
  .object({
    unit_id: z.string().uuid(),
    variant_id: z.string().uuid(),
    transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    type: rationStockTxTypeSchema,
    quantity: z.coerce.number().refine((n) => Number.isFinite(n), 'Quantity must be a finite number'),
    rate: z.coerce.number().nonnegative(),
    amount: z.coerce.number().nonnegative(),
    // Zod enum; persisted on the text `source` column.
    source: optionalStockSourceSchema,
    notes: z.string().trim().max(300).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'adjustment') {
      if (val.quantity === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['quantity'],
          message: 'Adjustment quantity must be a non-zero signed number',
        });
      }
      return;
    }
    if (val.quantity <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['quantity'],
        message: 'Quantity must be positive',
      });
    }
  })
  .openapi('CreateRationStockTransactionInput');

export const rationMonthlyNetReportQuerySchema = z
  .object({
    unit_id: z.string().uuid(),
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12),
  })
  .openapi('RationMonthlyNetReportQuery');

export type DailyConsumptionInput = z.infer<typeof dailyConsumptionInputSchema>;
export type SaveDailyConsumptionInput = z.infer<typeof saveDailyConsumptionSchema>;
export type CreateRationStockTransactionInput = z.infer<typeof createRationStockTransactionSchema>;
export type RationMonthlyNetReportQuery = z.infer<typeof rationMonthlyNetReportQuerySchema>;
