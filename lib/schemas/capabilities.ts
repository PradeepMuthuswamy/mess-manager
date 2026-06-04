import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { CAPABILITIES } from '@/lib/auth/types';

extendZodWithOpenApi(z);

export const capabilitySchema = z.enum(CAPABILITIES as unknown as [string, ...string[]]);

export const grantedCapabilitySchema = z.object({
  capability: capabilitySchema,
  unit_id: z.string().uuid().nullable(),
});

export const setUserCapabilitiesSchema = z.object({
  capabilities: z.array(grantedCapabilitySchema).max(200),
}).openapi('SetUserCapabilitiesInput');

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  capabilities: z.array(capabilitySchema).min(1).max(200),
}).openapi('CreateCapabilityTemplateInput');

export const updateTemplateSchema = createTemplateSchema.partial().openapi('UpdateCapabilityTemplateInput');

export type GrantedCapability = z.infer<typeof grantedCapabilitySchema>;
export type SetUserCapabilitiesInput = z.infer<typeof setUserCapabilitiesSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
