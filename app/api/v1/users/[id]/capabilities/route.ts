import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { setUserCapabilitiesSchema } from '@/lib/schemas';
import { getCollection } from '@/lib/mongo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id } = await params;
  
  const capsCol = await getCollection('user_capabilities');
  const data = await capsCol.find({ user_id: id }, {
    projection: { _id: 0, capability: 1, unit_id: 1, granted_at: 1, granted_by: 1 }
  }).toArray();
  
  return ok({ user_id: id, capabilities: data });
});

export const PUT = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id: targetUserId } = await params;
  if (!['super_admin', 'unit_admin', 'mess_secretary'].includes(ctx.user.role)) throw Errors.forbidden();

  const profilesCol = await getCollection('profiles');
  // Determine target user's unit to scope unit-admin permission
  const target = await profilesCol.findOne({ id: targetUserId }, { projection: { unit_id: 1, role: 1 } });
  
  if (!target) throw Errors.notFound();
  if (['unit_admin', 'mess_secretary'].includes(ctx.user.role) && target.unit_id !== ctx.user.homeUnitId) {
    throw Errors.forbidden();
  }

  const body = await req.json().catch(() => null);
  const parsed = setUserCapabilitiesSchema.safeParse(body);
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  // unit_admin / mess_secretary may only grant within their own unit.
  if (['unit_admin', 'mess_secretary'].includes(ctx.user.role)) {
    for (const c of parsed.data.capabilities) {
      if (c.unit_id && c.unit_id !== ctx.user.homeUnitId) {
        throw Errors.forbidden('Cannot grant capabilities outside your unit');
      }
    }
  }

  const capsCol = await getCollection('user_capabilities');
  
  try {
    await capsCol.deleteMany({ user_id: targetUserId });
  } catch (delErr: unknown) {
    throw Errors.internal((delErr instanceof Error ? delErr.message : String(delErr)));
  }

  if (parsed.data.capabilities.length) {
    const rows = parsed.data.capabilities
      .map((c) => {
        const unit = c.unit_id ?? target.unit_id;
        if (!unit) return null;
        return {
          id: crypto.randomUUID(),
          user_id: targetUserId,
          capability: c.capability as never,
          unit_id: unit,
          granted_by: ctx.user.id,
          granted_at: new Date(),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    
    if (rows.length) {
      try {
        await capsCol.insertMany(rows);
      } catch (error: unknown) {
        throw Errors.internal((error instanceof Error ? error.message : String(error)));
      }
    }
  }
  return ok({ ok: true, count: parsed.data.capabilities.length });
});
