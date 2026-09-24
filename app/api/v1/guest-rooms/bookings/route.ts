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

  const data = await getBookings(unit_id, from, to, ctx.supabase);
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

  // H4: Verify room belongs to this unit
  const { data: room, error: roomErr } = await ctx.supabase
    .from('rooms')
    .select('id')
    .eq('id', parsed.data.room_id)
    .eq('unit_id', parsed.data.unit_id)
    .maybeSingle();
  if (roomErr) throw Errors.internal(roomErr.message);
  if (!room) throw Errors.notFound('Room not found in this unit');

  // Verify availability
  const { data: conflicts, error: availErr } = await ctx.supabase
    .from('bookings')
    .select('id')
    .eq('room_id', parsed.data.room_id)
    .neq('status', 'cancelled')
    .lt('check_in_date', parsed.data.check_out_date)
    .gt('check_out_date', parsed.data.check_in_date)
    .limit(1);
  if (availErr) throw Errors.internal(availErr.message);
  if (conflicts && conflicts.length > 0) {
    throw Errors.conflict('Room is not available for the selected dates');
  }

  // Insert booking using authenticated Bearer client
  const { data: newBooking, error: insertErr } = await ctx.supabase
    .from('bookings')
    .insert({
      ...parsed.data,
      created_by: ctx.user.id,
    })
    .select('id')
    .single();

  if (insertErr) {
    if (insertErr.code === '23P01') {
      throw Errors.conflict('Room is not available for the selected dates (conflict detected)');
    }
    throw Errors.internal(insertErr.message);
  }

  const data = await getBookingSummaryById(newBooking.id, ctx.supabase);
  await storeResponse(idemKey, ctx.user.id, bodyText, 201, data);
  return created({ data }, `/api/v1/guest-rooms/bookings/${data.id}`);
});
