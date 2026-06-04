import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { messTypeSchema } from './attendance';
import { rationTerrainSchema } from './ration';

extendZodWithOpenApi(z);

export const createUnitSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(20),
  description: z.string().trim().max(500).optional(),
  is_active: z.boolean().default(true),
  mess_type: messTypeSchema.nullable().optional(),
  terrain: rationTerrainSchema.nullable().optional(),
}).openapi('CreateUnitInput');

export const updateUnitSchema = createUnitSchema.partial().openapi('UpdateUnitInput');

export const listUnitsQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  active_only: z.coerce.boolean().default(true),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
}).openapi('ListUnitsQuery');

export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
export type ListUnitsQuery = z.infer<typeof listUnitsQuerySchema>;
