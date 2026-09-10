import { z } from 'zod';

export const partyTypeSchema = z.enum(['mess', 'individual']);
export type PartyType = z.infer<typeof partyTypeSchema>;

export const partySchema = z.object({
  unit_id: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
  party_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  venue: z.string().trim().max(160).optional().nullable(),
  party_type: partyTypeSchema,
  notes: z.string().trim().max(1000).optional().nullable(),
});

export type PartyInput = z.infer<typeof partySchema>;
