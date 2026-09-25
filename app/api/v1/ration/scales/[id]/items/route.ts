import { NextRequest } from 'next/server';
import { withRoute, ok, created } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiCapability } from '@/lib/api/auth';
import { upsertScaleItemSchema } from '@/lib/schemas';
import { userHasCapability } from '@/lib/auth/capabilities';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';
import { getCollection } from '@/lib/mongo';
import { writeAudit } from '@/lib/audit/write-audit';
import { listScaleItemsCurrent } from '@/lib/ration/queries';
import type { RationScale } from '@/lib/ration/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);
  const { id } = await params;

  const col = await getCollection<RationScale>('ration_scales');
  const scale = await col.findOne({ id });
  if (!scale) throw Errors.notFound('Scale not found');
  if (!userHasCapability(ctx.user, 'ration.read', scale.unit_id)) {
    throw Errors.forbidden('Requires capability: ration.read');
  }

  const data = await listScaleItemsCurrent(id);
  return ok({ data, meta: { next_cursor: null, has_more: false } });
});

export const PUT = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const col = await getCollection<RationScale>('ration_scales');
  const scale = await col.findOne({ id });
  if (!scale) throw Errors.notFound('Scale not found');

  const ctx = await requireApiCapability(req, 'ration.adjust', scale.unit_id);
  await checkRateLimit(req, 'write', ctx.user.id);

  const bodyText = await req.text();
  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const parsed = upsertScaleItemSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const effective = parsed.data.effective_at
    ? new Date(parsed.data.effective_at).toISOString()
    : new Date().toISOString();
  const now = new Date().toISOString();

  const versionsCol = await getCollection('ration_scale_item_versions');
  const existing = await versionsCol.findOne({
    scale_id: id,
    variant_id: parsed.data.item_id,
    $or: [{ valid_to: null }, { valid_to: { $exists: false } }],
  });

  let versionId: string;
  if (
    existing &&
    Number(existing.auth_qty) === Number(parsed.data.auth_qty) &&
    existing.uom === parsed.data.uom &&
    (existing.notes ?? '') === (parsed.data.notes ?? '')
  ) {
    versionId = String(existing.id);
  } else {
    if (existing) {
      await versionsCol.updateMany(
        {
          scale_id: id,
          variant_id: parsed.data.item_id,
          $or: [{ valid_to: null }, { valid_to: { $exists: false } }],
        },
        { $set: { valid_to: effective } },
      );
    }

    versionId = crypto.randomUUID();
    const newDoc = {
      id: versionId,
      scale_id: id,
      variant_id: parsed.data.item_id,
      auth_qty: parsed.data.auth_qty,
      uom: parsed.data.uom,
      notes: parsed.data.notes ?? null,
      valid_from: effective,
      valid_to: null,
      created_by: ctx.user.id,
      created_at: now,
    };
    await versionsCol.insertOne(newDoc);
  }

  await writeAudit({
    table_name: 'ration_scale_item_versions',
    row_pk: versionId,
    op: 'INSERT',
    changed_by: ctx.user.id,
    active_unit_id: scale.unit_id,
    new_data: {
      scale_id: id,
      variant_id: parsed.data.item_id,
      auth_qty: parsed.data.auth_qty,
      uom: parsed.data.uom,
      notes: parsed.data.notes ?? null,
      valid_from: effective,
    },
  });

  const payload = { version_id: versionId, scale_id: id, item_id: parsed.data.item_id };
  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 201, payload);
  return created(payload);
});
