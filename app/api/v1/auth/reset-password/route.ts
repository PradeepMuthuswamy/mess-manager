import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { resetPasswordSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  const body = await req.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());
  const { error } = await ctx.supabase.auth.updateUser({ password: parsed.data.password });
  if (error) throw Errors.badRequest(error.message);
  return ok({ ok: true });
});
