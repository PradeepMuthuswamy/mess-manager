import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { userHasCapability } from '@/lib/auth/capabilities';
import { checkOutBookingSchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';
import { getBookingSummaryById } from '@/lib/guest-rooms/queries';
import { checkOutAction } from '@/lib/guest-rooms/actions';
import { getCollection } from '@/lib/mongo';

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

  const bookings = await getCollection('bookings');
  const booking = await bookings.findOne({ id });
  if (!booking) throw Errors.notFound('Booking not found');

  if (!userHasCapability(ctx.user, 'rooms.booking.write', booking.unit_id)) {
    throw Errors.forbidden('Requires capability: rooms.booking.write');
  }

  const idemKey = getIdempotencyKey(req);
  if (!idemKey) throw Errors.badRequest('Idempotency-Key header is required');

  const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
  if (replay) return replay;

  const result = await checkOutAction(parsed.data as never);
  if (result.error) {
    throw Errors.badRequest(result.error);
  }

  const data = await getBookingSummaryById(id);
  const response = ok({ data });
  await storeResponse(idemKey, ctx.user.id, response.status, await response.clone().text(), bodyText);
  return response;
});
