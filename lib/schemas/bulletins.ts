import { z } from 'zod';

export const bulletinSchema = z.object({
  unit_id: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(4000),
});

export type BulletinInput = z.infer<typeof bulletinSchema>;
