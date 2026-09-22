import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

export const eventTypeEnum = z.enum([
  'anniversary',
  'birthday',
  'mess_party',
  'individual_party',
  'formal_night',
  'holiday',
  'other',
]);
export type EventType = z.infer<typeof eventTypeEnum>;

const emailOrServiceNo = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(
    (value) => z.string().email().safeParse(value).success || !value.includes('@'),
    'Must be an email or service number',
  );

export const createEventSchema = z
  .object({
    unit_id: z.string().uuid(),
    event_date: isoDate,
    end_date: isoDate.optional().nullable(),
    event_type: eventTypeEnum,
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).optional().nullable(),
    profile_id: z.string().uuid().optional().nullable(),
    party_id: z.string().uuid().optional().nullable(),
    is_recurring: z.boolean().default(false),
  })
  .refine((data) => data.end_date == null || data.end_date >= data.event_date, {
    message: 'end_date must be on or after event_date',
    path: ['end_date'],
  });

export const importRowSchema = z.object({
  date: isoDate,
  type: eventTypeEnum,
  member: emailOrServiceNo.optional().nullable(),
  title: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const publishSchema = z.object({
  unit_id: z.string().uuid(),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type ImportRowInput = z.infer<typeof importRowSchema>;
export type PublishInput = z.infer<typeof publishSchema>;
