import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { userHasCapability } from '@/lib/auth/capabilities';
import { checkOutBookingSchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';
import { checkOutAction } from '@/lib/guest-rooms/actions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  if (!id) throw Errors.notFound();

  const bodyText = await req.text();
  const raw = JSON.parse(bodyText || 'null');
  const parsed = checkOutBookingSchema.safeParse({
    ...(raw && typeof raw === 'object' ? raw : {}),
    booking_id: id,
  });
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'write', ctx.user.id);

  if (!userHasCapability(ctx.user, 'rooms.booking.write')) {
    throw Errors.forbidden('Requires capability: rooms.booking.write');
  }

  const idemKey = getIdempotencyKey(req);
  if (!idemKey) throw Errors.badRequest('Idempotency-Key header is required');

  const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
  if (replay) return replay;

  const res = await checkOutAction(parsed.data);
  if ('error' in res) throw Errors.badRequest(res.error);

  const data = res.data ?? { ok: true };
  await storeResponse(idemKey, ctx.user.id, bodyText, 200, data);
  return ok({ data });
});
