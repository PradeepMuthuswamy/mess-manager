import { NextRequest } from 'next/server';
import { withRoute, ok, created } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { createScaleSchema, listScalesQuerySchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);

  const url = new URL(req.url);
  const parsed = listScalesQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const unitId = parsed.data.unit_id ?? ctx.user.activeUnitId;
  if (!unitId) throw Errors.badRequest('unit_id is required');

  let q = ctx.supabase
    .from('ration_scales')
    .select('id, unit_id, name, description, is_active, rank_class, terrain, created_at, updated_at, created_by, updated_by')
    .eq('unit_id', unitId)
    .order('rank_class')
    .order('terrain')
    .order('name')
    .limit(parsed.data.limit);

  if (parsed.data.active_only) q = q.eq('is_active', true);
  if (parsed.data.q) q = q.ilike('name', `%${parsed.data.q}%`);
  if (parsed.data.rank_class) q = q.eq('rank_class', parsed.data.rank_class);
  if (parsed.data.terrain) q = q.eq('terrain', parsed.data.terrain);

  const { data, error } = await q;
  if (error) throw Errors.internal(error.message);
  return ok({ data, meta: { next_cursor: null, has_more: false } });
});

export const POST = withRoute(async (req: NextRequest) => {
  const bodyText = await req.text();
  const parsed = createScaleSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'write', ctx.user.id);

  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const { data, error } = await ctx.supabase
    .from('ration_scales')
    .insert({
      unit_id: parsed.data.unit_id,
      name: parsed.data.name,
      rank_class: parsed.data.rank_class,
      terrain: parsed.data.terrain,
      description: parsed.data.description ?? null,
    })
    .select()
    .single();
  if (error?.code === '23505') throw Errors.conflict('A scale for that rank class and terrain already exists in this unit');
  if (error || !data) throw Errors.internal(error?.message ?? 'create failed');

  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 201, data);
  return created(data, `/api/v1/ration/scales/${data.id}`);
});
