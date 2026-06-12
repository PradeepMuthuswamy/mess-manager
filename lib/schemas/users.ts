import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const roleEnum = z.enum([
  'super_admin',
  'unit_admin',
  'mess_secretary',
  'mess_havildar',
  'bar_nco',
  'property_nco',
  'user',
  'manager',
]);
export type Role = z.infer<typeof roleEnum>;

const preprocessedRole = z.preprocess(
  (val) => (val === 'admin' ? 'super_admin' : val),
  roleEnum
);

export const inviteUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().trim().min(1).max(200).optional(),
  unit_id: z.string().uuid().nullable().optional(),
  role: preprocessedRole.default('user'),
  capability_template_id: z.string().uuid().optional(),
  capabilities: z.array(z.string()).optional(), // capability keys
}).openapi('InviteUserInput');

export const updateUserSchema = z.object({
  full_name: z.string().trim().min(1).max(200).optional(),
  service_no: z.string().trim().max(50).optional(),
  rank: z.string().trim().max(50).optional(),
  is_active: z.boolean().optional(),
  // role and unit_id are only editable by admin — endpoints enforce.
  role: preprocessedRole.optional(),
  unit_id: z.string().uuid().nullable().optional(),
}).openapi('UpdateUserInput');

export const listUsersQuerySchema = z.object({
  unit_id: z.string().uuid().optional(),
  role: preprocessedRole.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  active_only: z.coerce.boolean().default(true),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
}).openapi('ListUsersQuery');

export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
