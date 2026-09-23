import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

/** Shared by sign-in, reset, and accept-invite. */
const passwordSchema = z.string().min(8);

export const signInSchema = z.object({
  email: z.string().email().openapi({ example: 'officer@unit.mil' }),
  password: passwordSchema.openapi({ example: 'correct horse battery' }),
}).openapi('SignInInput');

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
}).openapi('ForgotPasswordInput');

export const resetPasswordSchema = z.object({
  password: passwordSchema,
}).openapi('ResetPasswordInput');

export const acceptInviteSchema = z.object({
  password: passwordSchema,
  fullName: z.string().trim().min(1).max(120).optional(),
}).openapi('AcceptInviteInput');

export type SignInInput = z.infer<typeof signInSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
