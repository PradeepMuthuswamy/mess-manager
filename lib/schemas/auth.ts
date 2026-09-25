import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

const passwordSchema = z.string().min(8);

export const signInSchema = z.object({
  email: z.string().email().openapi({ example: 'officer@unit.mil' }),
  password: passwordSchema.openapi({ example: 'correct horse battery' }),
}).openapi('SignInInput');

export type SignInInput = z.infer<typeof signInSchema>;
