import { NextRequest } from 'next/server';
import { withRoute, ok, noContent } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiRole } from '@/lib/api/auth';
import { updateTemplateSchema } from '@/lib/schemas';
import type { Database } from '@/lib/supabase/database.types';

type TemplateUpdate = Database['public']['Tables']['capability_templates']['Update'];

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id } = await params;
  const { data, error } = await ctx.supabase
    .from('capability_templates')
    .select('id, name, description, capabilities, is_system, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw Errors.internal(error.message);
  if (!data) throw Errors.notFound();
  return ok(data);
});

export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiRole(req, ['admin']);
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateTemplateSchema.safeParse(body);
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const update: TemplateUpdate = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.capabilities !== undefined) {
    update.capabilities = parsed.data.capabilities as TemplateUpdate['capabilities'];
  }
  update.updated_by = ctx.user.id;

  const { data, error } = await ctx.admin
    .from('capability_templates')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error?.code === '23505') throw Errors.conflict('Template with that name already exists');
  if (error) throw Errors.internal(error.message);
  return ok(data);
});

export const DELETE = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiRole(req, ['admin']);
  const { id } = await params;

  const { data: existing, error: getErr } = await ctx.admin
    .from('capability_templates')
    .select('id, is_system')
    .eq('id', id)
    .maybeSingle();
  if (getErr) throw Errors.internal(getErr.message);
  if (!existing) throw Errors.notFound();
  if (existing.is_system) throw Errors.forbidden('Cannot delete system templates');

  const { error } = await ctx.admin.from('capability_templates').delete().eq('id', id);
  if (error) throw Errors.internal(error.message);
  return noContent();
});
