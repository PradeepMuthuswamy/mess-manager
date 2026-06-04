import { NextRequest } from 'next/server';
import { withRoute, ok, created } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiCapability } from '@/lib/api/auth';
import { newItemVersionSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id } = await params;
  const { data, error } = await ctx.supabase
    .from('item_versions')
    .select('id, rate, ration_scale, notes, valid_from, valid_to, created_by, created_at')
    .eq('item_id', id)
    .order('valid_from', { ascending: false });
  if (error) throw Errors.internal(error.message);
  return ok({ data, meta: { next_cursor: null, has_more: false } });
});

export const POST = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const ctxUser = await requireApiUser(req);
  const { data: existing } = await ctxUser.supabase.from('items').select('unit_id').eq('id', id).maybeSingle();
  if (!existing) throw Errors.notFound();
  const cap = existing.unit_id ? 'masters.write' : 'masters.write.global';
  const ctx = await requireApiCapability(req, cap, existing.unit_id ?? null);

  const body = await req.json().catch(() => null);
  const parsed = newItemVersionSchema.safeParse(body);
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const { data, error } = await ctx.admin.rpc('set_item_rate', {
    p_item_id: id,
    p_rate: parsed.data.rate,
    ...(parsed.data.ration_scale != null ? { p_ration_scale: parsed.data.ration_scale } : {}),
    ...(parsed.data.notes != null ? { p_notes: parsed.data.notes } : {}),
    p_effective_at: parsed.data.effective_at ? new Date(parsed.data.effective_at).toISOString() : new Date().toISOString(),
  });
  if (error) throw Errors.internal(error.message);
  return created({ version_id: data });
});
