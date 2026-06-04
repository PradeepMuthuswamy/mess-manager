import { NextRequest } from 'next/server';
import { withRoute, ok, noContent } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiCapability } from '@/lib/api/auth';
import { updateScaleSchema } from '@/lib/schemas';
import { userHasCapability } from '@/lib/auth/capabilities';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';
import type { Database } from '@/lib/supabase/database.types';

type RationScaleUpdate = Database['public']['Tables']['ration_scales']['Update'];

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id } = await params;

  const { data, error } = await ctx.supabase
    .from('ration_scales')
    .select('id, unit_id, name, description, is_active, created_at, updated_at, created_by, updated_by')
    .eq('id', id)
    .maybeSingle();
  if (error) throw Errors.internal(error.message);
  if (!data) throw Errors.notFound('Scale not found');

  if (!userHasCapability(ctx.user, 'ration.read', data.unit_id)) {
    throw Errors.forbidden('Requires capability: ration.read');
  }
  return ok(data);
});

export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctxUser = await requireApiUser(req);
  const { id } = await params;
  const { data: existing } = await ctxUser.supabase
    .from('ration_scales')
    .select('unit_id')
    .eq('id', id)
    .maybeSingle();
  if (!existing) throw Errors.notFound('Scale not found');

  const ctx = await requireApiCapability(req, 'ration.adjust', existing.unit_id);
  await checkRateLimit(req, 'write', ctx.user.id);

  const bodyText = await req.text();
  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const parsed = updateScaleSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const patch: RationScaleUpdate = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description ?? null;
  if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active;

  const { data, error } = await ctx.supabase
    .from('ration_scales')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw Errors.internal(error.message);

  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 200, data);
  return ok(data);
});

export const DELETE = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctxUser = await requireApiUser(req);
  const { id } = await params;
  const { data: existing } = await ctxUser.supabase
    .from('ration_scales')
    .select('unit_id')
    .eq('id', id)
    .maybeSingle();
  if (!existing) throw Errors.notFound('Scale not found');

  const ctx = await requireApiCapability(req, 'ration.adjust', existing.unit_id);

  const { error } = await ctx.supabase
    .from('ration_scales')
    .update({ is_active: false })
    .eq('id', id);
  if (error) throw Errors.internal(error.message);
  return noContent();
});
