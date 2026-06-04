import { NextRequest } from 'next/server';
import { withRoute, ok, created } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiCapability } from '@/lib/api/auth';
import { upsertScaleItemSchema } from '@/lib/schemas';
import { userHasCapability } from '@/lib/auth/capabilities';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);
  const { id } = await params;

  const { data: scale } = await ctx.supabase
    .from('ration_scales')
    .select('unit_id')
    .eq('id', id)
    .maybeSingle();
  if (!scale) throw Errors.notFound('Scale not found');
  if (!userHasCapability(ctx.user, 'ration.read', scale.unit_id)) {
    throw Errors.forbidden('Requires capability: ration.read');
  }

  const { data, error } = await ctx.supabase
    .from('v_ration_scale_items_current')
    .select('*')
    .eq('scale_id', id)
    .order('item_name');
  if (error) throw Errors.internal(error.message);
  return ok({ data, meta: { next_cursor: null, has_more: false } });
});

export const PUT = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const ctxUser = await requireApiUser(req);
  const { data: scale } = await ctxUser.supabase
    .from('ration_scales')
    .select('unit_id')
    .eq('id', id)
    .maybeSingle();
  if (!scale) throw Errors.notFound('Scale not found');

  const ctx = await requireApiCapability(req, 'ration.adjust', scale.unit_id);
  await checkRateLimit(req, 'write', ctx.user.id);

  const bodyText = await req.text();
  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const parsed = upsertScaleItemSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const { data, error } = await ctx.supabase.rpc('set_ration_scale_item', {
    p_scale_id: id,
    p_item_id: parsed.data.item_id,
    p_auth_qty: parsed.data.auth_qty,
    p_uom: parsed.data.uom,
    ...(parsed.data.notes != null ? { p_notes: parsed.data.notes } : {}),
    p_effective_at: parsed.data.effective_at
      ? new Date(parsed.data.effective_at).toISOString()
      : new Date().toISOString(),
  });
  if (error) throw Errors.internal(error.message);

  const payload = { version_id: data, scale_id: id, item_id: parsed.data.item_id };
  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 201, payload);
  return created(payload);
});
