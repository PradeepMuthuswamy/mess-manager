import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { userHasCapability } from '@/lib/auth/capabilities';
import { updateBookingSchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getBookingById, getBookingSummaryById } from '@/lib/guest-rooms/queries';
import { updateBookingAction } from '@/lib/guest-rooms/actions';
import { getCollection } from '@/lib/mongo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);

  const { id } = await params;
  if (!id) throw Errors.notFound();

  const bookings = await getCollection('bookings');
  const booking = await bookings.findOne({ id });
  if (!booking) throw Errors.notFound('Booking not found');

  if (!userHasCapability(ctx.user, 'rooms.read', booking.unit_id)) {
    throw Errors.forbidden('Requires capability: rooms.read');
  }

  const data = await getBookingById(id);
  return ok({ data });
});

export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  if (!id) throw Errors.notFound();

  const body = await req.json().catch(() => null);
  const parsed = updateBookingSchema.safeParse(body);
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'write', ctx.user.id);

  const bookings = await getCollection('bookings');
  const existing = await bookings.findOne({ id });
  if (!existing) throw Errors.notFound('Booking not found');

  if (!userHasCapability(ctx.user, 'rooms.booking.write', existing.unit_id)) {
    throw Errors.forbidden('Requires capability: rooms.booking.write');
  }

  const result = await updateBookingAction(id, parsed.data as never);
  if ('error' in result && result.error) {
    if (result.error.toLowerCase().includes('not available') || result.error.toLowerCase().includes('conflict')) {
      throw Errors.conflict(result.error);
    }
    throw Errors.badRequest(result.error);
  }

  const data = await getBookingSummaryById(id);
  return ok({ data });
});
