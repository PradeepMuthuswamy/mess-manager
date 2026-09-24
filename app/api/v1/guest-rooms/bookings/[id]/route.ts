import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { userHasCapability } from '@/lib/auth/capabilities';
import { updateBookingSchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getBookingById, getBookingSummaryById } from '@/lib/guest-rooms/queries';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);

  const { id } = await params;
  if (!id) throw Errors.notFound();

  const { data: booking, error: peekErr } = await ctx.supabase
    .from('bookings')
    .select('unit_id')
    .eq('id', id)
    .maybeSingle();

  if (peekErr) throw Errors.internal(peekErr.message);
  if (!booking) throw Errors.notFound('Booking not found');

  if (!userHasCapability(ctx.user, 'rooms.read', booking.unit_id)) {
    throw Errors.forbidden('Requires capability: rooms.read');
  }

  const data = await getBookingById(id, ctx.supabase);
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

  const { data: existing, error: peekErr } = await ctx.supabase
    .from('bookings')
    .select('unit_id, room_id, check_in_date, check_out_date, settlement_type, host_profile_id')
    .eq('id', id)
    .maybeSingle();

  if (peekErr) throw Errors.internal(peekErr.message);
  if (!existing) throw Errors.notFound('Booking not found');

  if (!userHasCapability(ctx.user, 'rooms.booking.write', existing.unit_id)) {
    throw Errors.forbidden('Requires capability: rooms.booking.write');
  }

  const settlementType = parsed.data.settlement_type ?? existing.settlement_type;
  const hostId = parsed.data.host_profile_id ?? existing.host_profile_id;
  if (settlementType === 'CHARGE_TO_HOST' && !hostId) {
    throw Errors.badRequest('A sponsoring host officer is required when charging to mess bill.');
  }

  const roomId = parsed.data.room_id ?? existing.room_id;
  const checkIn = parsed.data.check_in_date ?? existing.check_in_date;
  const checkOut = parsed.data.check_out_date ?? existing.check_out_date;

  if (
    roomId !== existing.room_id ||
    checkIn !== existing.check_in_date ||
    checkOut !== existing.check_out_date
  ) {
    const { data: conflict, error: conflictErr } = await ctx.supabase
      .from('bookings')
      .select('id')
      .eq('room_id', roomId)
      .neq('id', id)
      .neq('status', 'cancelled')
      .lt('check_in_date', checkOut)
      .gt('check_out_date', checkIn)
      .limit(1);

    if (conflictErr) throw Errors.internal(conflictErr.message);
    if (conflict && conflict.length > 0) {
      throw Errors.conflict('Room is not available for the selected dates');
    }
  }

  const { error: updErr } = await ctx.supabase
    .from('bookings')
    .update(parsed.data)
    .eq('id', id);

  if (updErr) {
    if (updErr.code === '23P01') {
      throw Errors.conflict('Room is not available for the selected dates (conflict detected)');
    }
    throw Errors.internal(updErr.message);
  }

  const data = await getBookingSummaryById(id, ctx.supabase);
  return ok({ data });
});
