import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { userHasCapability } from '@/lib/auth/capabilities';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getBookingSummaryById } from '@/lib/guest-rooms/queries';
import { checkInAction } from '@/lib/guest-rooms/actions';
import { getDb } from '@/lib/mongo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  if (!id) throw Errors.notFound();

  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'write', ctx.user.id);

  const db = await getDb();
  const booking = await db.collection('bookings').findOne({ id });
  if (!booking) throw Errors.notFound('Booking not found');

  if (!userHasCapability(ctx.user, 'rooms.booking.write', booking.unit_id)) {
    throw Errors.forbidden('Requires capability: rooms.booking.write');
  }

  const result = await checkInAction(id);
  if ('error' in result && result.error) {
    throw Errors.badRequest(result.error);
  }

  const updated = await getBookingSummaryById(id);
  return ok({ data: updated });
});
