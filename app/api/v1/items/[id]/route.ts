import { NextRequest } from 'next/server';
import { withRoute, ok, noContent } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiCapability } from '@/lib/api/auth';
import { updateItemSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id } = await params;
  const { data, error } = await ctx.supabase.from('v_items_current').select('*').eq('id', id).maybeSingle();
  if (error) throw Errors.internal(error.message);
  if (!data) throw Errors.notFound();
  return ok(data);
});

export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctxUser = await requireApiUser(req);
  const { id } = await params;
  const { data: existing } = await ctxUser.supabase.from('items').select('unit_id').eq('id', id).maybeSingle();
  if (!existing) throw Errors.notFound();
  const cap = existing.unit_id ? 'masters.write' : 'masters.write.global';
  const ctx = await requireApiCapability(req, cap, existing.unit_id ?? null);
  const body = await req.json().catch(() => null);
  const parsed = updateItemSchema.safeParse(body);
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());
  const { data, error } = await ctx.admin.from('items').update(parsed.data).eq('id', id).select().single();
  if (error) throw Errors.internal(error.message);
  return ok(data);
});

export const DELETE = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctxUser = await requireApiUser(req);
  const { id } = await params;
  const { data: existing } = await ctxUser.supabase.from('items').select('unit_id').eq('id', id).maybeSingle();
  if (!existing) throw Errors.notFound();
  const cap = existing.unit_id ? 'masters.write' : 'masters.write.global';
  const ctx = await requireApiCapability(req, cap, existing.unit_id ?? null);
  // Soft delete
  const { error } = await ctx.admin.from('items').update({ is_active: false }).eq('id', id);
  if (error) throw Errors.internal(error.message);
  return noContent();
});
