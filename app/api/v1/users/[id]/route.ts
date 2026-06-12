import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { updateUserSchema } from '@/lib/schemas';
import type { Database } from '@/lib/supabase/database.types';

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

  type ProfileUpdate = {
    full_name?: string | null;
    service_no?: string | null;
    rank?: string | null;
    is_active?: boolean;
    role?: Database["public"]["Enums"]["user_role"];
    unit_id?: string | null;
  };
  const update: ProfileUpdate = {};
  if (parsed.data.full_name !== undefined) update.full_name = parsed.data.full_name;
  if (parsed.data.service_no !== undefined) update.service_no = parsed.data.service_no;
  if (parsed.data.rank !== undefined) update.rank = parsed.data.rank;
  if (parsed.data.is_active !== undefined) update.is_active = parsed.data.is_active;
  if (parsed.data.role !== undefined) {
    update.role = ((parsed.data.role as string) === 'admin' ? 'super_admin' : parsed.data.role) as Database["public"]["Enums"]["user_role"];
  }
  if (parsed.data.unit_id !== undefined) update.unit_id = parsed.data.unit_id;

  const { data, error } = await ctx.supabase
    .from('profiles')
    .update(update)
    .eq('id', id)
    .select('id, email, full_name, role, unit_id, is_active, rank, service_no, display_name, created_at, updated_at')
    .single();
  if (error) throw Errors.internal(error.message);
  return ok(data);
});
