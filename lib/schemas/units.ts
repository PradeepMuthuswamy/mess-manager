import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { messTypeSchema } from './attendance';
import { rationTerrainSchema } from './ration';

extendZodWithOpenApi(z);

export const UNIT_MODULE_IDS = [
  'attendance',
  'ration',
  'bar',
  'guest_rooms',
  'billing',
  'parties',
  'calendar',
] as const;
export type UnitModuleId = (typeof UNIT_MODULE_IDS)[number];

export const UNIT_MODULE_LABEL: Record<UnitModuleId, string> = {
  attendance: 'Attendance',
  ration: 'Ration',
  bar: 'Bar',
  guest_rooms: 'Guest rooms',
  billing: 'Billing',
  parties: 'Parties',
  calendar: 'Social calendar',
};
import { billFormatTemplateEnum, type BillFormatTemplate } from './billing';

export const BILL_FORMAT_LABEL: Record<BillFormatTemplate, string> = {
  classic: 'Classic',
  compact: 'Compact',
  formal: 'Formal',
};

const unitModuleSchema = z.enum(UNIT_MODULE_IDS);
const billFormatSchema = z.enum(billFormatTemplateEnum);

const unitFieldsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(20),
  description: z.string().trim().max(500).nullable().optional(),
  is_active: z.boolean().default(true),
  mess_type: messTypeSchema.nullable().optional(),
  terrain: rationTerrainSchema.nullable().optional(),
  enabled_modules: z.array(unitModuleSchema).min(1).optional(),
  bill_format_template: billFormatSchema.optional(),
  room_bill_format_template: billFormatSchema.optional(),
});

export const createUnitSchema = unitFieldsSchema.extend({
  admin_email: z.string().email(),
  admin_full_name: z.string().trim().min(1).max(200),
}).openapi('CreateUnitInput');

export const updateUnitSchema = unitFieldsSchema.partial().openapi('UpdateUnitInput');

export const listUnitsQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  active_only: z.coerce.boolean().default(true),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
}).openapi('ListUnitsQuery');

export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
export type ListUnitsQuery = z.infer<typeof listUnitsQuerySchema>;
