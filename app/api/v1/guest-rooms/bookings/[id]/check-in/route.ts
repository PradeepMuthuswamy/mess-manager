import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { userHasCapability } from '@/lib/auth/capabilities';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getBookingSummaryById } from '@/lib/guest-rooms/queries';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  if (!id) throw Errors.notFound();

  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'write', ctx.user.id);

  // Peek booking to find unit_id for capability check
  const { data: booking, error: peekErr } = await ctx.supabase
    .from('bookings')
    .select('unit_id, status')
    .eq('id', id)
    .maybeSingle();

  if (peekErr) throw Errors.internal(peekErr.message);
  if (!booking) throw Errors.notFound('Booking not found');

  if (!userHasCapability(ctx.user, 'rooms.booking.write', booking.unit_id)) {
    throw Errors.forbidden('Requires capability: rooms.booking.write');
  }

  // Atomic check-in via RPC with the authenticated Bearer client
  const { error: rpcErr } = await ctx.supabase.rpc('check_in_booking', {
    p_booking_id: id,
  });

  if (rpcErr) {
    const msg = rpcErr.message?.replace(/^[A-Z0-9]+:\s*/, '') || 'Check-in failed';
    throw Errors.badRequest(msg);
  }

  const updated = await getBookingSummaryById(id, ctx.supabase);
  return ok({ data: updated });
});
