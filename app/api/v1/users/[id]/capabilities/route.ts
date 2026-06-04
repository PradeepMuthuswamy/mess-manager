import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { setUserCapabilitiesSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id } = await params;
  const { data, error } = await ctx.supabase
    .from('user_capabilities')
    .select('capability, unit_id, granted_at, granted_by')
    .eq('user_id', id);
  if (error) throw Errors.internal(error.message);
  return ok({ user_id: id, capabilities: data });
});

export const PUT = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id: targetUserId } = await params;
  if (ctx.user.role === 'user' || ctx.user.role === 'manager') throw Errors.forbidden();

  // Determine target user's unit to scope unit-admin permission
  const { data: target } = await ctx.supabase
    .from('profiles')
    .select('unit_id, role')
    .eq('id', targetUserId)
    .maybeSingle();
  if (!target) throw Errors.notFound();
  if (ctx.user.role === 'unit_admin' && target.unit_id !== ctx.user.homeUnitId) {
    throw Errors.forbidden();
  }

  const body = await req.json().catch(() => null);
  const parsed = setUserCapabilitiesSchema.safeParse(body);
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  // unit_admin may only grant within their own unit.
  if (ctx.user.role === 'unit_admin') {
    for (const c of parsed.data.capabilities) {
      if (c.unit_id && c.unit_id !== ctx.user.homeUnitId) {
        throw Errors.forbidden('Cannot grant capabilities outside your unit');
      }
    }
  }

  // Replace: delete then insert
  const { error: delErr } = await ctx.admin
    .from('user_capabilities')
    .delete()
    .eq('user_id', targetUserId);
  if (delErr) throw Errors.internal(delErr.message);

  if (parsed.data.capabilities.length) {
    const rows = parsed.data.capabilities
      .map((c) => {
        const unit = c.unit_id ?? target.unit_id;
        if (!unit) return null;
        return {
          user_id: targetUserId,
          capability: c.capability as never,
          unit_id: unit,
          granted_by: ctx.user.id,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length) {
      const { error } = await ctx.admin.from('user_capabilities').insert(rows);
      if (error) throw Errors.internal(error.message);
    }
  }
  return ok({ ok: true, count: parsed.data.capabilities.length });
});
