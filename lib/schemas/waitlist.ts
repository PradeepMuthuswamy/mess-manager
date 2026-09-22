import { z } from 'zod';

export const waitlistStatusSchema = z.enum(['requested', 'offered', 'cancelled', 'booked']);
export type WaitlistStatus = z.infer<typeof waitlistStatusSchema>;

export const createWaitlistSchema = z.object({
  unit_id: z.string().uuid(),
  guest_name: z.string().trim().min(2, 'Guest name must be at least 2 characters.').max(120),
  requested_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Check-in must be a date.'),
  requested_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Check-out must be a date.'),
  notes: z.string().trim().max(500).optional().nullable(),
}).refine((data) => data.requested_to > data.requested_from, {
  message: 'Check-out must be after check-in.',
  path: ['requested_to'],
});

export type CreateWaitlistInput = z.infer<typeof createWaitlistSchema>;

export const waitlistIdSchema = z.string().uuid();
