import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { updateUserSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id } = await params;
  // RLS will enforce visibility (self / unit-admin-of-same-unit / admin).
  const { data, error } = await ctx.supabase
    .from('profiles')
    .select('id, email, full_name, role, unit_id, is_active, rank, service_no, display_name, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw Errors.internal(error.message);
  if (!data) throw Errors.notFound();
  return ok(data);
});

export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const isSelf = ctx.user.id === id;
  const role = ctx.user.role;

  // Role/unit_id changes only by admin.
  const wantsRoleChange = parsed.data.role !== undefined;
  const wantsUnitChange = parsed.data.unit_id !== undefined;
  if ((wantsRoleChange || wantsUnitChange) && role !== 'admin') {
    throw Errors.forbidden('Only admin may change role or unit');
  }

  // Permission rules:
  // - admin: all
  // - unit_admin: profiles in their unit (RLS will also restrict, but we check up-front for clearer errors)
  // - others: self only, non-privileged fields
  if (role !== 'admin') {
    // Need to look up target to check unit / existence.
    const { data: target } = await ctx.supabase
      .from('profiles')
      .select('id, unit_id')
      .eq('id', id)
      .maybeSingle();
    if (!target) throw Errors.notFound();
    if (role === 'unit_admin') {
      if (target.unit_id !== ctx.user.homeUnitId) throw Errors.forbidden();
    } else {
      if (!isSelf) throw Errors.forbidden();
      // user / manager updating self — disallow is_active toggle.
      if (parsed.data.is_active !== undefined) throw Errors.forbidden('Cannot change is_active');
    }
  }

  type ProfileUpdate = {
    full_name?: string | null;
    service_no?: string | null;
    rank?: string | null;
    is_active?: boolean;
    role?: 'user' | 'manager' | 'unit_admin' | 'admin';
    unit_id?: string | null;
  };
  const update: ProfileUpdate = {};
  if (parsed.data.full_name !== undefined) update.full_name = parsed.data.full_name;
  if (parsed.data.service_no !== undefined) update.service_no = parsed.data.service_no;
  if (parsed.data.rank !== undefined) update.rank = parsed.data.rank;
  if (parsed.data.is_active !== undefined) update.is_active = parsed.data.is_active;
  if (parsed.data.role !== undefined) update.role = parsed.data.role;
  if (parsed.data.unit_id !== undefined) update.unit_id = parsed.data.unit_id;

  const client = role === 'admin' || role === 'unit_admin' ? ctx.admin : ctx.supabase;
  const { data, error } = await client
    .from('profiles')
    .update(update)
    .eq('id', id)
    .select('id, email, full_name, role, unit_id, is_active, rank, service_no, display_name, created_at, updated_at')
    .single();
  if (error) throw Errors.internal(error.message);
  return ok(data);
});
