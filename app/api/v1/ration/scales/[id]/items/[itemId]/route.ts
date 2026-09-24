import { NextRequest } from 'next/server';
import { withRoute, ok, noContent } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiCapability } from '@/lib/api/auth';
import { userHasCapability } from '@/lib/auth/capabilities';
import { getCollection } from '@/lib/mongo';
import { writeAudit } from '@/lib/audit/write-audit';
import type { RationScale } from '@/lib/ration/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string; itemId: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id, itemId } = await params;

  const col = await getCollection<RationScale>('ration_scales');
  const scale = await col.findOne({ id });
  if (!scale) throw Errors.notFound('Scale not found');
  if (!userHasCapability(ctx.user, 'ration.read', scale.unit_id)) {
    throw Errors.forbidden('Requires capability: ration.read');
  }

  const versionsCol = await getCollection('ration_scale_item_versions');
  const data = await versionsCol
    .find({ scale_id: id, variant_id: itemId })
    .sort({ valid_from: -1 })
    .toArray();

  return ok({ data, meta: { next_cursor: null, has_more: false } });
});

export const DELETE = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const { id, itemId } = await params;
  const col = await getCollection<RationScale>('ration_scales');
  const scale = await col.findOne({ id });
  if (!scale) throw Errors.notFound('Scale not found');

  const ctx = await requireApiCapability(req, 'ration.adjust', scale.unit_id);

  const versionsCol = await getCollection('ration_scale_item_versions');
  const now = new Date().toISOString();

  await versionsCol.updateMany(
    {
      scale_id: id,
      variant_id: itemId,
      $or: [{ valid_to: null }, { valid_to: { $exists: false } }],
    },
    { $set: { valid_to: now } },
  );

  await writeAudit({
    table_name: 'ration_scale_item_versions',
    row_pk: `${id}:${itemId}`,
    op: 'UPDATE',
    changed_by: ctx.user.id,
    active_unit_id: scale.unit_id,
    new_data: { valid_to: now },
  });

  return noContent();
});
