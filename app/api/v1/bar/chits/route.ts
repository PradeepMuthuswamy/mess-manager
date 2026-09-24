import { NextRequest } from 'next/server';
import { withRoute, ok, created } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { createBarChitSchema, listBarChitsQuerySchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';
import { createBarChitCore } from '@/lib/bar/actions';
import { listBarChits } from '@/lib/bar/queries';
import { getCollection } from '@/lib/mongo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);

  const url = new URL(req.url);
  const parsed = listBarChitsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const unitId = parsed.data.unit_id ?? ctx.user.activeUnitId ?? ctx.user.homeUnitId ?? null;
  if (unitId === null) {
    return ok({ data: [] });
  }

  const allChits = await listBarChits(unitId);
  const page = allChits.slice(0, parsed.data.limit);
  return ok({ data: page });
});

export const POST = withRoute(async (req: NextRequest) => {
  const bodyText = await req.text();
  const parsed = createBarChitSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'write', ctx.user.id);

  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const chitId = await createBarChitCore(ctx.user.id, parsed.data);

  const barChits = await getCollection('bar_chits');
  const barChitItems = await getCollection('bar_chit_items');

  const chitRow = await barChits.findOne({ id: chitId });
  const items = await barChitItems.find({ chit_id: chitId }).toArray();

  const responseBody = { ...chitRow, items };
  const response = created(responseBody, `/api/v1/bar/chits/${chitId}`);
  if (idemKey) {
    await storeResponse(idemKey, ctx.user.id, response.status, await response.clone().text(), bodyText);
  }
  return response;
});
