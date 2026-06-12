import { NextRequest } from 'next/server';
import { withRoute, ok, noContent } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiCapability } from '@/lib/api/auth';
import { userHasCapability } from '@/lib/auth/capabilities';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string; itemId: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id, itemId } = await params;

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
    .from('ration_scale_item_versions')
    .select('id, scale_id, variant_id, auth_qty, uom, notes, valid_from, valid_to, created_at, created_by')
    .eq('scale_id', id)
    .eq('variant_id', itemId)
    .order('valid_from', { ascending: false });
  if (error) throw Errors.internal(error.message);
  return ok({ data, meta: { next_cursor: null, has_more: false } });
});

export const DELETE = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const { id, itemId } = await params;
  const ctxUser = await requireApiUser(req);
  const { data: scale } = await ctxUser.supabase
    .from('ration_scales')
    .select('unit_id')
    .eq('id', id)
    .maybeSingle();
  if (!scale) throw Errors.notFound('Scale not found');

  const ctx = await requireApiCapability(req, 'ration.adjust', scale.unit_id);

  const { error } = await ctx.supabase
    .from('ration_scale_item_versions')
    .update({ valid_to: new Date().toISOString() })
    .eq('scale_id', id)
    .eq('variant_id', itemId)
    .is('valid_to', null);
  if (error) throw Errors.internal(error.message);
  return noContent();
});
