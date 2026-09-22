import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { userHasCapability } from '@/lib/auth/capabilities';
import { updateBookingSchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import {
  fetchBookingWithBillAction,
  updateBookingAction,
} from '@/lib/guest-rooms/actions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);

  const { id } = await params;
  if (!id) throw Errors.notFound();

  if (!userHasCapability(ctx.user, 'rooms.read')) {
    throw Errors.forbidden('Requires capability: rooms.read');
  }

  const res = await fetchBookingWithBillAction(id);
  if ('error' in res) {
    if (res.error === 'Booking not found') throw Errors.notFound(res.error);
    throw Errors.badRequest(res.error);
  }

  return ok({ data: res.data });
});

export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  if (!id) throw Errors.notFound();

  const body = await req.json().catch(() => null);
  const parsed = updateBookingSchema.safeParse(body);
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'write', ctx.user.id);

  if (!userHasCapability(ctx.user, 'rooms.booking.write')) {
    throw Errors.forbidden('Requires capability: rooms.booking.write');
  }

  const res = await updateBookingAction(id, parsed.data);
  if ('error' in res) {
    if (res.error === 'Booking not found') throw Errors.notFound(res.error);
    if (res.error === 'Invalid input') {
      throw Errors.validation('details' in res ? res.details : undefined);
    }
    throw Errors.badRequest(res.error);
  }

  return ok({ data: res.data });
});
