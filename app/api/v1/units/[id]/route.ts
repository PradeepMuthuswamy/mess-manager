import { NextRequest } from 'next/server';
import { withRoute, ok, noContent } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { updateUnitSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id } = await params;
  const { data, error } = await ctx.supabase.from('units').select('*').eq('id', id).maybeSingle();
  if (error) throw Errors.internal(error.message);
  if (!data) throw Errors.notFound();
  return ok(data);
});

export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateUnitSchema.safeParse(body);
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());
  const { data, error } = await ctx.admin.from('units').update(parsed.data).eq('id', id).select().single();
  if (error) throw Errors.internal(error.message);
  return ok(data);
});

export const DELETE = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id } = await params;
  // Soft-delete: set is_active=false.
  const { error } = await ctx.admin.from('units').update({ is_active: false }).eq('id', id);
  if (error) throw Errors.internal(error.message);
  return noContent();
});
