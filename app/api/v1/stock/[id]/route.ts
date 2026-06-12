import { NextRequest } from 'next/server';
import { withRoute, ok, noContent } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { updateLotSchema } from '@/lib/schemas/inventory';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);
  const { id } = await params;
  const { data, error } = await ctx.supabase
    .from('v_unit_inventory_current')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw Errors.internal(error.message);
  if (!data) throw Errors.notFound();
  return ok(data);
});

export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id } = await params;

  // Resolve the lot's unit to scope the capability check.
  const { data: existing } = await ctx.supabase
    .from('unit_inventory')
    .select('unit_id')
    .eq('id', id)
    .maybeSingle();
  if (!existing) throw Errors.notFound();

  await checkRateLimit(req, 'write', ctx.user.id);

  const bodyText = await req.text();
  const parsed = updateLotSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const { acquired_on, pack_size_id, ...rest } = parsed.data;
  const update = {
    ...rest,
    ...(pack_size_id !== undefined ? { variant_id: pack_size_id } : {}),
    ...(acquired_on !== undefined
      ? { acquired_on: acquired_on ? acquired_on.toISOString().slice(0, 10) : null }
      : {}),
    updated_by: ctx.user.id,
  };

  // Service-role mutation — structurally pin to the resolved unit so the
  // RLS-bypassing client can never touch another unit's lot.
  const { data, error } = await ctx.admin
    .from('unit_inventory')
    .update(update)
    .eq('id', id)
    .eq('unit_id', existing.unit_id)
    .select()
    .single();
  if (error) throw Errors.internal(error.message);

  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 200, data);
  return ok(data);
});

export const DELETE = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id } = await params;

  const { data: existing } = await ctx.supabase
    .from('unit_inventory')
    .select('unit_id')
    .eq('id', id)
    .maybeSingle();
  if (!existing) throw Errors.notFound();

  await checkRateLimit(req, 'write', ctx.user.id);

  // Soft delete — preserve the lot for audit/history. Service-role mutation
  // structurally pinned to the resolved unit.
  const { error } = await ctx.admin
    .from('unit_inventory')
    .update({ is_active: false, updated_by: ctx.user.id })
    .eq('id', id)
    .eq('unit_id', existing.unit_id);
  if (error) throw Errors.internal(error.message);
  return noContent();
});
