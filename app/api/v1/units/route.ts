import { NextRequest } from 'next/server';
import { withRoute, ok, created } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiRole } from '@/lib/api/auth';
import { createUnitSchema, listUnitsQuerySchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';
import { rollbackNewUnit, cloneMasterRationScales } from '@/lib/units/onboard';
import { inviteFirstUnitAdmin } from '@/lib/units/invite-unit-admin';
import { getCollection } from '@/lib/mongo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);
  const url = new URL(req.url);
  const parsed = listUnitsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const unitsCol = await getCollection('units');
  let query: Record<string, unknown> = {};
  if (parsed.data.active_only) {
    query.is_active = true;
  }
  if (parsed.data.q) {
    const needle = parsed.data.q.replace(/[%_,]/g, '');
    if (needle) {
      query.$or = [
        { name: { $regex: needle, $options: 'i' } },
        { code: { $regex: needle, $options: 'i' } }
      ];
    }
  }

  const data = await unitsCol.find(query, {
    projection: { _id: 0, id: 1, name: 1, code: 1, description: 1, is_active: 1, mess_type: 1, terrain: 1, enabled_modules: 1, bill_format_template: 1, room_bill_format_template: 1, created_at: 1, updated_at: 1 }
  })
    .sort({ name: 1 })
    .limit(parsed.data.limit || 0)
    .toArray();

  return ok({ data, meta: { next_cursor: null, has_more: false } });
});

export const POST = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiRole(req, ['super_admin']);
  await checkRateLimit(req, 'write', ctx.user.id);
  const bodyText = await req.text();

  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const parsed = createUnitSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());
  const { admin_email, admin_full_name, ...unitFields } = parsed.data;
  
  const newId = crypto.randomUUID();
  const now = new Date();
  const payload = {
    ...unitFields,
    id: newId,
    code: unitFields.code.toUpperCase(),
    created_by: ctx.user.id,
    updated_by: ctx.user.id,
    created_at: now,
    updated_at: now,
  };

  const unitsCol = await getCollection('units');
  try {
    await unitsCol.insertOne(payload);
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string };
    if (err.code === 11000) {
      throw Errors.conflict('Unit with that code or name already exists');
    }
    throw Errors.internal((err instanceof Error ? err.message : String(err)) || 'Unknown error');
  }
  const data = payload;

  try {
    await cloneMasterRationScales(data.id, ctx.user.id);
  } catch (cloneErr: unknown) {
    const errMsg = cloneErr instanceof Error ? cloneErr.message : String(cloneErr);
    const rollback = await rollbackNewUnit(data.id);
    if (rollback.error) {
      throw Errors.internal(
        `Unit created but ration scales could not be cloned, and cleanup failed: ${errMsg}`,
      );
    }
    throw Errors.internal(`Could not finish onboarding: ${errMsg}`);
  }

  const invited = await inviteFirstUnitAdmin({
    email: admin_email,
    fullName: admin_full_name,
    unitId: data.id,
    unitName: data.name,
  });
  if ('error' in invited) {
    throw Errors.internal(`Unit created, but the unit admin could not be invited: ${invited.error}`);
  }

  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 201, data);
  return created(data, `/api/v1/units/${data.id}`);
});
