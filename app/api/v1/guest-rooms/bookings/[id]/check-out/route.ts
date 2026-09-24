import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { userHasCapability } from '@/lib/auth/capabilities';
import { checkOutBookingSchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';
import { getBookingSummaryById } from '@/lib/guest-rooms/queries';

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

  // Peek booking to find unit_id and bill for capability check
  const { data: booking, error: peekErr } = await ctx.supabase
    .from('bookings')
    .select('*, bill:room_bills(id)')
    .eq('id', id)
    .maybeSingle();

  if (peekErr) throw Errors.internal(peekErr.message);
  if (!booking) throw Errors.notFound('Booking not found');

  if (!userHasCapability(ctx.user, 'rooms.booking.write', booking.unit_id)) {
    throw Errors.forbidden('Requires capability: rooms.booking.write');
  }

  const bill = Array.isArray(booking.bill) ? booking.bill[0] : booking.bill;
  if (!bill) throw Errors.notFound('Bill not found for this booking');

  const settlementType = parsed.data.settlement_type ?? booking.settlement_type ?? 'DIRECT_SETTLEMENT';
  const hostId = parsed.data.host_profile_id ?? booking.host_profile_id;
  if (settlementType === 'CHARGE_TO_HOST' && !hostId) {
    throw Errors.badRequest('A sponsoring host officer is required when charging to mess bill.');
  }

  const idemKey = getIdempotencyKey(req);
  if (!idemKey) throw Errors.badRequest('Idempotency-Key header is required');

  const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
  if (replay) return replay;

  // Generate folio number
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const folioSuffix = bill.id.replace(/-/g, '').slice(0, 6).toUpperCase();
  const folioNumber = `FOLIO-${yearMonth}-${folioSuffix}`;

  // Call finalize_checkout RPC via Bearer client
  const { error: rpcErr } = await ctx.supabase.rpc('finalize_checkout', {
    p_booking_id: id,
    p_settlement_type: settlementType,
    p_host_profile_id: hostId ?? null,
    p_folio_number: folioNumber,
    p_paid_amount: parsed.data.paid_amount ?? null,
    p_payment_method: parsed.data.payment_method ?? null,
    p_payment_ref: parsed.data.payment_reference ?? null,
  });

  if (rpcErr) {
    const msg = rpcErr.message?.replace(/^[A-Z0-9]+:\s*/, '') || 'Check-out failed';
    throw Errors.badRequest(msg);
  }

  const data = await getBookingSummaryById(id, ctx.supabase);
  await storeResponse(idemKey, ctx.user.id, bodyText, 200, data);
  return ok({ data });
});
