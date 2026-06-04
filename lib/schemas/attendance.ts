import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { rationTerrainSchema } from './ration';

extendZodWithOpenApi(z);

export const messTypeEnum = ['officer', 'jco', 'or', 'combined'] as const;
export type MessType = (typeof messTypeEnum)[number];
export const messTypeSchema = z.enum(messTypeEnum);

export const MESS_TYPE_LABEL: Record<MessType, string> = {
  officer: 'Officers',
  jco: 'JCOs',
  or: 'OR',
  combined: 'Combined',
};

export const attendanceStatusEnum = ['draft', 'finalized'] as const;
export type AttendanceStatus = (typeof attendanceStatusEnum)[number];
export const attendanceStatusSchema = z.enum(attendanceStatusEnum);

export const personTypeEnum = ['profile', 'dependant'] as const;
export type PersonType = (typeof personTypeEnum)[number];
export const personTypeSchema = z.enum(personTypeEnum);

const isoDate = z
  .coerce.date()
  .transform((d) => d.toISOString().slice(0, 10));

export const absenteeSchema = z.object({
  person_type: personTypeSchema,
  person_id: z.string().uuid(),
  reason: z.string().trim().max(300).optional(),
});

export const saveAttendanceSchema = z
  .object({
    unit_id: z.string().uuid(),
    attendance_date: isoDate,
    absent: z.array(absenteeSchema).max(2000),
  })
  .openapi('SaveAttendanceInput');

export const finalizeAttendanceSchema = z
  .object({
    unit_id: z.string().uuid(),
    attendance_date: isoDate,
  })
  .openapi('FinalizeAttendanceInput');

export const setUnitConfigSchema = z
  .object({
    unit_id: z.string().uuid(),
    mess_type: messTypeSchema.nullable().optional(),
    terrain: rationTerrainSchema.nullable().optional(),
  })
  .openapi('SetUnitConfigInput');

export const setDiningInSchema = z
  .object({
    person_type: personTypeSchema,
    person_id: z.string().uuid(),
    dining_in: z.coerce.boolean(),
  })
  .openapi('SetDiningInInput');

export const listAttendanceQuerySchema = z
  .object({
    unit_id: z.string().uuid(),
    attendance_date: isoDate,
  })
  .openapi('ListAttendanceQuery');

export type Absentee = z.infer<typeof absenteeSchema>;
export type SaveAttendanceInput = z.infer<typeof saveAttendanceSchema>;
export type FinalizeAttendanceInput = z.infer<typeof finalizeAttendanceSchema>;
export type SetUnitConfigInput = z.infer<typeof setUnitConfigSchema>;
export type SetDiningInInput = z.infer<typeof setDiningInSchema>;
export type ListAttendanceQuery = z.infer<typeof listAttendanceQuerySchema>;
