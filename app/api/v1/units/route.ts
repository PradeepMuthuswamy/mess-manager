import { NextRequest } from 'next/server';
import { withRoute, ok, created } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiRole } from '@/lib/api/auth';
import { createUnitSchema, listUnitsQuerySchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);
  const url = new URL(req.url);
  const parsed = listUnitsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  let q = ctx.supabase.from('units').select('id, name, code, description, is_active, created_at, updated_at').order('name').limit(parsed.data.limit);
  if (parsed.data.active_only) q = q.eq('is_active', true);
  if (parsed.data.q) q = q.ilike('name', `%${parsed.data.q}%`);
  const { data, error } = await q;
  if (error) throw Errors.internal(error.message);
  return ok({ data, meta: { next_cursor: null, has_more: false } });
});

export const POST = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiRole(req, ['admin']);
  await checkRateLimit(req, 'write', ctx.user.id);
  const bodyText = await req.text();

  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const parsed = createUnitSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const { data, error } = await ctx.admin.from('units').insert(parsed.data).select().single();
  if (error?.code === '23505') throw Errors.conflict('Unit with that code or name already exists');
  if (error) throw Errors.internal(error.message);

  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 201, data);
  return created(data, `/api/v1/units/${data.id}`);
});
