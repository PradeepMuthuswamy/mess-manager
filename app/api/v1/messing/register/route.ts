import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getRegisterForDate } from '@/lib/messing/register-queries';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const registerQuerySchema = z.object({
  unit_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);

  const url = new URL(req.url);
  const parsed = registerQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const data = await getRegisterForDate(parsed.data.unit_id, parsed.data.date);
  return ok({ data });
});
