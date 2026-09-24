import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, type ApiContext } from '@/lib/api/auth';
import { userHasCapability } from '@/lib/auth/capabilities';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';
import { patchRoomBillSchema } from '@/lib/schemas/guest-rooms';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const BILL_DETAIL_SELECT = `
  *,
  items:room_bill_items (
    id,
    bill_id,
    category,
    description,
    amount,
    quantity,
    meal_type,
    order_id,
    variant_id,
    bar_chit_id,
    created_at
  )
`;

async function loadBill(supabase: ApiContext['supabase'], id: string) {
  const { data, error } = await supabase
    .from('room_bills')
    .select(BILL_DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw Errors.internal(error.message);
  if (!data) throw Errors.notFound();
  return data;
}

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);

  const { id } = await params;
  if (!id) throw Errors.notFound();

  const bill = await loadBill(ctx.supabase, id);
  if (!userHasCapability(ctx.user, 'rooms.read', bill.unit_id)) {
    throw Errors.forbidden('Requires capability: rooms.read');
  }

  return ok(bill);
});

export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  if (!id) throw Errors.notFound();

  const bodyText = await req.text();
  let body: unknown;
  try {
    body = JSON.parse(bodyText || 'null');
  } catch {
    throw Errors.validation({ formErrors: ['Invalid JSON'] });
  }

  const parsed = patchRoomBillSchema.safeParse(body);
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'write', ctx.user.id);

  const bill = await loadBill(ctx.supabase, id);
  if (!userHasCapability(ctx.user, 'rooms.booking.write', bill.unit_id)) {
    throw Errors.forbidden('Requires capability: rooms.booking.write');
  }

  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const itemsById = new Map((bill.items ?? []).map((item) => [item.id, item]));

  for (const item of parsed.data.items) {
    const existing = itemsById.get(item.id);
    if (!existing) throw Errors.notFound('Bill item not found');

    const updatePayload: { amount?: number; description?: string } = {};
    if (item.amount !== undefined) updatePayload.amount = item.amount;
    if (item.description !== undefined) updatePayload.description = item.description;

    if (Object.keys(updatePayload).length > 0) {
      const { error } = await ctx.supabase
        .from('room_bill_items')
        .update(updatePayload)
        .eq('id', item.id)
        .eq('bill_id', id);
      if (error) throw Errors.internal(error.message);
    }
  }

  const updated = await loadBill(ctx.supabase, id);
  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 200, updated);
  return ok(updated);
});
