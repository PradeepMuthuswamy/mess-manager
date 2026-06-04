import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const relationEnum = z.enum(['spouse', 'child', 'parent']);
export type Relation = z.infer<typeof relationEnum>;

export const RELATION_LABELS: Record<Relation, string> = {
  spouse: 'Spouse',
  child: 'Child',
  parent: 'Parent',
};

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const createDependantSchema = z.object({
  primary_profile_id: z.string().uuid(),
  unit_id: z.string().uuid(),
  full_name: z.string().trim().min(1).max(200),
  relation: relationEnum,
  date_of_birth: dateString.optional().nullable(),
  gender: z.string().trim().max(30).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
}).openapi('CreateDependantInput');

export const updateDependantSchema = z.object({
  full_name: z.string().trim().min(1).max(200).optional(),
  relation: relationEnum.optional(),
  date_of_birth: dateString.optional().nullable(),
  gender: z.string().trim().max(30).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  is_active: z.boolean().optional(),
}).openapi('UpdateDependantInput');

export type CreateDependantInput = z.infer<typeof createDependantSchema>;
export type UpdateDependantInput = z.infer<typeof updateDependantSchema>;
