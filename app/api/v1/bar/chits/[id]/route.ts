import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';
import {
  finalizeBarChitAction,
  reopenBarChitAction,
} from '@/lib/bar/actions';
import { getCollection } from '@/lib/mongo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const patchBarChitSchema = z.object({
  action: z.enum(['finalize', 'reopen']),
});

export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  if (!id) throw Errors.notFound();

  const bodyText = await req.text();
  const parsed = patchBarChitSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'write', ctx.user.id);

  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const res =
    parsed.data.action === 'finalize'
      ? await finalizeBarChitAction({ id })
      : await reopenBarChitAction({ id });

  if (res.error) throw Errors.badRequest(res.error);

  const barChits = await getCollection('bar_chits');
  const barChitItems = await getCollection('bar_chit_items');

  const chitRow = await barChits.findOne({ id });
  if (!chitRow) throw Errors.notFound();

  const items = await barChitItems.find({ chit_id: id }).toArray();
  const result = { ...chitRow, items };

  if (idemKey) await storeResponse(idemKey, ctx.user.id, 200, JSON.stringify(result), bodyText);
  return ok(result);
});
