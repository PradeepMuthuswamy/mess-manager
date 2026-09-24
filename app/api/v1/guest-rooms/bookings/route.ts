import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute, ok, created } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { userHasCapability } from '@/lib/auth/capabilities';
import { createBookingSchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';
import { getBookings, getBookingSummaryById } from '@/lib/guest-rooms/queries';
import { createBookingAction } from '@/lib/guest-rooms/actions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

const listBookingsQuerySchema = z.object({
  unit_id: z.string().uuid(),
  from: isoDate,
  to: isoDate,
});

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);

  const url = new URL(req.url);
  const parsed = listBookingsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const { unit_id, from, to } = parsed.data;
  if (!userHasCapability(ctx.user, 'rooms.read', unit_id)) {
    throw Errors.forbidden('Requires capability: rooms.read');
  }

  const data = await getBookings(unit_id, from, to);
  return ok({ data });
});

export const POST = withRoute(async (req: NextRequest) => {
  const bodyText = await req.text();
  const parsed = createBookingSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'write', ctx.user.id);

  if (!userHasCapability(ctx.user, 'rooms.booking.write', parsed.data.unit_id)) {
    throw Errors.forbidden('Requires capability: rooms.booking.write');
  }

  if (parsed.data.settlement_type === 'CHARGE_TO_HOST' && !parsed.data.host_profile_id) {
    throw Errors.badRequest('A sponsoring host officer is required when charging to mess bill.');
  }

  const idemKey = getIdempotencyKey(req);
  if (!idemKey) throw Errors.badRequest('Idempotency-Key header is required');

  const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
  if (replay) return replay;

  const result = await createBookingAction(parsed.data as never);
  if ('error' in result && result.error) {
    if (result.error.toLowerCase().includes('not available') || result.error.toLowerCase().includes('conflict')) {
      throw Errors.conflict(result.error);
    }
    throw Errors.badRequest(result.error);
  }

  const bookingId = (result as never).booking?.id || (result as never).id;
  const data = await getBookingSummaryById(bookingId);
  const response = created({ data }, `/api/v1/guest-rooms/bookings/${data?.id ?? bookingId}`);
  await storeResponse(idemKey, ctx.user.id, response.status, await response.clone().text(), bodyText);
  return response;
});
