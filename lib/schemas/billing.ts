import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const billingPeriodStatusEnum = ['open', 'calculating', 'draft', 'published', 'closed'] as const;
export const billStatusEnum = ['draft', 'published', 'paid', 'overdue', 'cancelled'] as const;
export const billLineCategoryEnum = [
  'messing',
  'bar',
  'room',
  'guest_meal',
  'subscription',
  'misc',
  'party',
  'arrear',
] as const;

export type BillingPeriodStatus = (typeof billingPeriodStatusEnum)[number];
export type BillStatus = (typeof billStatusEnum)[number];
export type BillLineCategory = (typeof billLineCategoryEnum)[number];

export const createBillingPeriodSchema = z.object({
  unit_id: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  billing_year: z.coerce.number().int().min(2020).max(2100),
  billing_month: z.coerce.number().int().min(1).max(12),
}).openapi('CreateBillingPeriodInput');

export const runBillingSchema = z.object({
  unit_id: z.string().uuid(),
  billing_period_id: z.string().uuid(),
}).openapi('RunBillingInput');

export const publishBillsSchema = z.object({
  billing_period_id: z.string().uuid(),
}).openapi('PublishBillsInput');

export const markBillPaidSchema = z.object({
  bill_id: z.string().uuid(),
  paid_amount: z.coerce.number().positive(),
  payment_method: z.string().trim().min(1),
  payment_reference: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
}).openapi('MarkBillPaidInput');

export const createSubscriptionSchema = z.object({
  unit_id: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().optional().nullable(),
  amount: z.coerce.number().min(0),
}).openapi('CreateSubscriptionInput');

export const createMiscDebitSchema = z.object({
  unit_id: z.string().uuid(),
  profile_id: z.string().uuid(),
  charge_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.enum(['personal_recovery', 'damage_breakage', 'laundry_tailor', 'sports_club', 'other']),
  description: z.string().trim().min(2).max(255),
  amount: z.coerce.number().positive(),
  receipt_ref: z.string().trim().optional().nullable(),
}).openapi('CreateMiscDebitInput');

export type CreateBillingPeriodInput = z.infer<typeof createBillingPeriodSchema>;
export type RunBillingInput = z.infer<typeof runBillingSchema>;
export type PublishBillsInput = z.infer<typeof publishBillsSchema>;
export type MarkBillPaidInput = z.infer<typeof markBillPaidSchema>;
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type CreateMiscDebitInput = z.infer<typeof createMiscDebitSchema>;
