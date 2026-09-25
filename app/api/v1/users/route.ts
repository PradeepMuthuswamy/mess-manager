import { NextRequest } from 'next/server';
import { getCollection } from '@/lib/mongo';
import { withRoute, ok, created } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiCapability } from '@/lib/api/auth';
import { inviteUserSchema, listUsersQuerySchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);
  if (!['super_admin', 'unit_admin'].includes(ctx.user.role)) throw Errors.forbidden();
  const url = new URL(req.url);
  const parsed = listUsersQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const wantUnit = ['unit_admin', 'mess_secretary'].includes(ctx.user.role) ? ctx.user.homeUnitId : parsed.data.unit_id ?? null;
  const profilesCol = await getCollection('profiles');
  const query: Record<string, unknown> = {};
  if (parsed.data.active_only) query.is_active = true;
  if (parsed.data.role) query.role = parsed.data.role;
  if (wantUnit) query.unit_id = wantUnit;
  if (parsed.data.q) query.full_name = { $regex: parsed.data.q, $options: 'i' };

  try {
    const data = await profilesCol.find(query)
      .sort({ full_name: 1 })
      .limit(parsed.data.limit || 100)
      .project({ _id: 0, id: 1, email: 1, full_name: 1, role: 1, unit_id: 1, is_active: 1, rank: 1, service_no: 1, display_name: 1, created_at: 1, updated_at: 1 })
      .toArray();
    return ok({ data, meta: { next_cursor: null, has_more: false } });
  } catch (error: unknown) {
    throw Errors.internal((error instanceof Error ? error.message : String(error)));
  }
});

export const POST = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiCapability(req, 'users.invite');
  await checkRateLimit(req, 'write', ctx.user.id);
  const bodyText = await req.text();
  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }
  const parsed = inviteUserSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  // Only super_admin may set role to super_admin or unit_admin; unit_admin can only invite as user/manager into their own unit
  if (ctx.user.role !== 'super_admin') {
    if (parsed.data.role === 'super_admin' || parsed.data.role === 'unit_admin') {
      throw Errors.forbidden('Only super_admin may grant elevated roles');
    }
    if (['unit_admin', 'mess_secretary'].includes(ctx.user.role)) {
      if (parsed.data.unit_id && parsed.data.unit_id !== ctx.user.homeUnitId) {
        throw Errors.forbidden('Cannot invite into other units');
      }
    }
  }

  const targetUnit = parsed.data.unit_id ?? null;
  const invitedUserId = crypto.randomUUID();

  const profilesCol = await getCollection('profiles');
  await profilesCol.updateOne(
    { id: invitedUserId },
    { $set: {
      role: parsed.data.role,
      unit_id: targetUnit,
      ...(parsed.data.full_name ? { full_name: parsed.data.full_name } : {}),
      updated_at: new Date()
    }}
  );

  const capsCol = await getCollection('user_capabilities');
  // Apply capability template if provided
  if (parsed.data.capability_template_id && targetUnit) {
    const tplCol = await getCollection('capability_templates');
    const tpl = await tplCol.findOne({ id: parsed.data.capability_template_id }, { projection: { capabilities: 1 } });
    if (tpl) {
      const rows = (tpl.capabilities as string[]).map((c) => ({
        user_id: invitedUserId,
        capability: c as never,
        unit_id: targetUnit,
      }));
      for (const row of rows) {
        await capsCol.updateOne({ user_id: row.user_id, capability: row.capability, unit_id: row.unit_id }, { $set: row }, { upsert: true });
      }
    }
  }
  // Apply explicit capabilities[] if provided
  if (parsed.data.capabilities && parsed.data.capabilities.length && targetUnit) {
    const rows = parsed.data.capabilities.map((c) => ({
      user_id: invitedUserId,
      capability: c as never,
      unit_id: targetUnit,
    }));
    for (const row of rows) {
      await capsCol.updateOne({ user_id: row.user_id, capability: row.capability, unit_id: row.unit_id }, { $set: row }, { upsert: true });
    }
  }

  const body = { id: invitedUserId, email: parsed.data.email };
  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 201, body);
  return created(body, `/api/v1/users/${invitedUserId}`);
});
