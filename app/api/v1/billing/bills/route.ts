import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getMessBillsForPeriod } from '@/lib/billing/queries';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const billsQuerySchema = z.object({
  period_id: z.string().uuid(),
});

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);

  const url = new URL(req.url);
  const parsed = billsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const data = await getMessBillsForPeriod(parsed.data.period_id);
  return ok({ data });
});
