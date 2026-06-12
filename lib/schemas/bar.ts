import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const createBarChitSchema = z.object({
  unit_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  consumer_type: z.enum(['member', 'guest']),
  profile_id: z.string().uuid().nullable().optional(),
  guest_name: z.string().nullable().optional(),
  booking_id: z.string().uuid().nullable().optional(),
  items: z.array(
    z.object({
      variant_id: z.string().uuid(),
      lot_id: z.string().uuid().nullable().optional(),
      quantity: z.number().positive(),
      rate: z.number().nonnegative(),
      name: z.string(), // for error reporting
      unit: z.enum(['bottle', 'peg']).default('bottle').optional(),
    })
  ).min(1),
}).openapi('CreateBarChitInput');

export const listBarChitsQuerySchema = z.object({
  unit_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).openapi('ListBarChitsQuery');

export type CreateBarChitInput = z.infer<typeof createBarChitSchema>;
export type ListBarChitsQuery = z.infer<typeof listBarChitsQuerySchema>;
