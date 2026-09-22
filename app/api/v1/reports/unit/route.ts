import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { userHasCapability } from '@/lib/auth/capabilities';
import { getUnitReport } from '@/lib/reports/queries';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const unitReportQuerySchema = z
  .object({
    unit_id: z.string().uuid().optional(),
    start: z.string().regex(ISO_DATE, 'Invalid date format'),
    end: z.string().regex(ISO_DATE, 'Invalid date format'),
  })
  .refine((d) => d.start <= d.end, {
    message: 'start must be on or before end',
    path: ['start'],
  });

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);

  const url = new URL(req.url);
  const parsed = unitReportQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const unitId = parsed.data.unit_id ?? ctx.user.activeUnitId ?? ctx.user.homeUnitId ?? null;

  if (!userHasCapability(ctx.user, 'reports.unit', unitId)) {
    throw Errors.forbidden();
  }

  if (unitId === null) {
    throw Errors.badRequest('No unit specified');
  }

  const data = await getUnitReport(unitId, parsed.data.start, parsed.data.end);
  return ok({ data });
});
