import { NextRequest } from 'next/server';
import { withRoute, ok, noContent } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiCapability } from '@/lib/api/auth';
import { updateScaleSchema } from '@/lib/schemas';
import { userHasCapability } from '@/lib/auth/capabilities';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';
import { getCollection } from '@/lib/mongo';
import { writeAudit } from '@/lib/audit/write-audit';
import type { RationScale } from '@/lib/ration/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id } = await params;

  const col = await getCollection<RationScale>('ration_scales');
  const data = await col.findOne({ id });
  if (!data) throw Errors.notFound('Scale not found');

  if (!userHasCapability(ctx.user, 'ration.read', data.unit_id)) {
    throw Errors.forbidden('Requires capability: ration.read');
  }
  return ok(data);
});

export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctxUser = await requireApiUser(req);
  const { id } = await params;

  const col = await getCollection<RationScale>('ration_scales');
  const existing = await col.findOne({ id });
  if (!existing) throw Errors.notFound('Scale not found');

  const ctx = await requireApiCapability(req, 'ration.adjust', existing.unit_id);
  await checkRateLimit(req, 'write', ctx.user.id);

  const bodyText = await req.text();
  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const parsed = updateScaleSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: ctx.user.id,
  };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description ?? null;
  if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active;

  await col.updateOne({ id }, { $set: patch });
  const updated = await col.findOne({ id });

  await writeAudit({
    table_name: 'ration_scales',
    row_pk: id,
    op: 'UPDATE',
    changed_by: ctx.user.id,
    active_unit_id: existing.unit_id,
    old_data: existing as never,
    new_data: patch,
  });

  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 200, updated);
  return ok(updated);
});

export const DELETE = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;

  const col = await getCollection<RationScale>('ration_scales');
  const existing = await col.findOne({ id });
  if (!existing) throw Errors.notFound('Scale not found');

  const ctx = await requireApiCapability(req, 'ration.adjust', existing.unit_id);

  const now = new Date().toISOString();
  await col.updateOne(
    { id },
    { $set: { is_active: false, updated_at: now, updated_by: ctx.user.id } },
  );

  await writeAudit({
    table_name: 'ration_scales',
    row_pk: id,
    op: 'UPDATE',
    changed_by: ctx.user.id,
    active_unit_id: existing.unit_id,
    old_data: existing as never,
    new_data: { is_active: false },
  });

  return noContent();
});
