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

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const patchBarChitSchema = z.object({
  action: z.enum(['finalize', 'reopen']),
});

const CHIT_DETAIL_SELECT = `
  *,
  profile:profile_id (id, full_name, email, rank, service_no),
  booking:booking_id (
    id,
    guest_name,
    room:room_id (name)
  ),
  items:bar_chit_items (
    *,
    variant:variant_id (
      id,
      unit_value,
      unit_type,
      package_type,
      product:product_id (name)
    )
  )
`;

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

  const { data: chitRow, error: fetchErr } = await ctx.supabase
    .from('bar_chits')
    .select(CHIT_DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) throw Errors.internal(fetchErr.message);
  if (!chitRow) throw Errors.notFound();

  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 200, chitRow);
  return ok(chitRow);
});
