import { z } from 'zod';

export const partyTypeSchema = z.enum(['mess', 'individual']);
export type PartyType = z.infer<typeof partyTypeSchema>;

export const partyCostCategorySchema = z.enum(['ration', 'bar', 'catering', 'other']);
export const partyFundingSchema = z.enum(['mess', 'host', 'guest']);

export const partySchema = z.object({
  unit_id: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
  party_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  venue: z.string().trim().max(160).optional().nullable(),
  party_type: partyTypeSchema,
  host_profile_id: z.string().uuid().optional().nullable(),
  expected_headcount: z.coerce.number().int().min(0).max(10000).optional().nullable(),
  budget_amount: z.coerce.number().min(0).max(99_999_999.99).optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export type PartyInput = z.infer<typeof partySchema>;

export const submitPartyBudgetSchema = z.object({
  party_id: z.string().uuid(),
  budget_amount: z.coerce.number().min(0).max(99_999_999.99).optional(),
});

export const approvePartyBudgetSchema = z.object({
  party_id: z.string().uuid(),
});

export const addPartyGuestSchema = z.object({
  party_id: z.string().uuid(),
  guest_name: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const addPartyCostLineSchema = z.object({
  party_id: z.string().uuid(),
  category: partyCostCategorySchema,
  funding: partyFundingSchema,
  description: z.string().trim().min(1).max(255),
  amount: z.coerce.number().min(0).max(99_999_999.99),
});

export const finalizePartySchema = z.object({
  party_id: z.string().uuid(),
});

export type SubmitPartyBudgetInput = z.infer<typeof submitPartyBudgetSchema>;
export type ApprovePartyBudgetInput = z.infer<typeof approvePartyBudgetSchema>;
export type AddPartyGuestInput = z.infer<typeof addPartyGuestSchema>;
export type AddPartyCostLineInput = z.infer<typeof addPartyCostLineSchema>;
export type FinalizePartyInput = z.infer<typeof finalizePartySchema>;
