import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { userHasCapability } from '@/lib/auth/capabilities';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';
import { patchRoomBillSchema } from '@/lib/schemas/guest-rooms';
import { getDb } from '@/lib/mongo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

async function loadBill(id: string) {
  const db = await getDb();
  const bill = await db.collection('room_bills').findOne({ id });
  if (!bill) throw Errors.notFound();
  const items = await db.collection('room_bill_items').find({ bill_id: id }).toArray();
  return { ...bill, items } as never;
}

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);

  const { id } = await params;
  if (!id) throw Errors.notFound();

  const bill = await loadBill(id);
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

  const bill = await loadBill(id);
  if (!userHasCapability(ctx.user, 'rooms.booking.write', bill.unit_id)) {
    throw Errors.forbidden('Requires capability: rooms.booking.write');
  }

  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const db = await getDb();
  const itemsById = new Map((bill.items ?? []).map((item: Record<string, unknown>) => [item.id, item]));

  for (const item of parsed.data.items) {
    const existing = itemsById.get(item.id);
    if (!existing) throw Errors.notFound('Bill item not found');

    const updatePayload: Record<string, unknown> = {};
    if (item.amount !== undefined) updatePayload.amount = item.amount;
    if (item.description !== undefined) updatePayload.description = item.description;

    if (Object.keys(updatePayload).length > 0) {
      await db.collection('room_bill_items').updateOne(
        { id: item.id, bill_id: id },
        { $set: updatePayload }
      );
    }
  }

  const updated = await loadBill(id);
  if (idemKey) await storeResponse(idemKey, ctx.user.id, 200, JSON.stringify(updated), bodyText);
  return ok(updated);
});
