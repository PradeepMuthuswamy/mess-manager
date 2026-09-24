import { NextRequest } from 'next/server';
import { withRoute, ok } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { updateUserSchema } from '@/lib/schemas';
import { getDb } from '@/lib/mongo';
import { writeAudit } from '@/lib/audit/write-audit';
import type { UserDoc } from '@/lib/users/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id } = await params;

  const db = await getDb();
  const user = await db.collection<UserDoc>('users').findOne({ id });
  if (!user) throw Errors.notFound();

  const isSelf = ctx.user.id === id;
  if (ctx.user.role !== 'super_admin') {
    if (['unit_admin', 'mess_secretary'].includes(ctx.user.role)) {
      if (user.unit_id !== ctx.user.homeUnitId) throw Errors.forbidden();
    } else if (!isSelf) {
      throw Errors.forbidden();
    }
  }

  const { _id, ...cleanUser } = user as never;
  return ok(cleanUser);
});

export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const db = await getDb();
  const usersCol = db.collection<UserDoc>('users');
  const target = await usersCol.findOne({ id });
  if (!target) throw Errors.notFound();

  const isSelf = ctx.user.id === id;
  const role = ctx.user.role;

  // Role/unit_id changes only by super_admin.
  const wantsRoleChange = parsed.data.role !== undefined;
  const wantsUnitChange = parsed.data.unit_id !== undefined;
  if ((wantsRoleChange || wantsUnitChange) && role !== 'super_admin') {
    throw Errors.forbidden('Only super_admin may change role or unit');
  }

  if (role !== 'super_admin') {
    if (['unit_admin', 'mess_secretary'].includes(role)) {
      if (target.unit_id !== ctx.user.homeUnitId) throw Errors.forbidden();
    } else {
      if (!isSelf) throw Errors.forbidden();
      if (parsed.data.is_active !== undefined) throw Errors.forbidden('Cannot change is_active');
    }
  }

  const now = new Date().toISOString();
  const update: Partial<UserDoc> = { updated_at: now };
  if (parsed.data.full_name !== undefined) update.full_name = parsed.data.full_name;
  if (parsed.data.service_no !== undefined) update.service_no = parsed.data.service_no;
  if (parsed.data.rank !== undefined) update.rank = parsed.data.rank;
  if (parsed.data.is_active !== undefined) update.is_active = parsed.data.is_active;
  if (parsed.data.role !== undefined) update.role = parsed.data.role;
  if (parsed.data.unit_id !== undefined) update.unit_id = parsed.data.unit_id;

  await usersCol.updateOne({ id }, { $set: update });

  const updated = { ...target, ...update };
  delete (updated as never)._id;

  await writeAudit({
    table_name: 'users',
    row_pk: id,
    op: 'UPDATE',
    changed_by: ctx.user.id,
    active_unit_id: target.unit_id,
    old_data: target as never,
    new_data: updated as never,
  });

  return ok(updated);
});
