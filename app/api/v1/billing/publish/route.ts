import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { publishBillsSchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';
import { publishBillingPeriodAction } from '@/lib/billing/actions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = withRoute(async (req: NextRequest) => {
  const bodyText = await req.text();
  const parsed = publishBillsSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'write', ctx.user.id);

  const idemKey = getIdempotencyKey(req);
  if (!idemKey) throw Errors.badRequest('Idempotency-Key header is required');

  const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
  if (replay) return replay;

  const res = await publishBillingPeriodAction(parsed.data);
  if ('error' in res) throw Errors.badRequest(res.error);

  const data = res.data ?? { ok: true };
  await storeResponse(idemKey, ctx.user.id, bodyText, 200, data);
  return ok({ data });
});
