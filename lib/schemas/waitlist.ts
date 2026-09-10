import { z } from 'zod';

export const waitlistStatusSchema = z.enum(['requested', 'offered', 'cancelled', 'booked']);
export type WaitlistStatus = z.infer<typeof waitlistStatusSchema>;

export const createWaitlistSchema = z.object({
  unit_id: z.string().uuid(),
  guest_name: z.string().trim().min(2).max(120),
  requested_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requested_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(500).optional().nullable(),
});

export type CreateWaitlistInput = z.infer<typeof createWaitlistSchema>;

export const waitlistIdSchema = z.string().uuid();
