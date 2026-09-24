import { NextRequest } from 'next/server';
import { withRoute, ok, noContent } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiCapability } from '@/lib/api/auth';
import { updateLotSchema } from '@/lib/schemas/inventory';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';
import { getCollection } from '@/lib/mongo';
import { writeAudit } from '@/lib/audit/write-audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);
  const { id } = await params;

  const invCol = await getCollection('unit_inventory');

  const pipeline: Record<string, unknown>[] = [
    { $match: { id } },
    {
      $lookup: {
        from: 'product_variants',
        localField: 'variant_id',
        foreignField: 'id',
        as: 'variant',
      },
    },
    { $unwind: '$variant' },
    {
      $lookup: {
        from: 'products',
        localField: 'variant.product_id',
        foreignField: 'id',
        as: 'product',
      },
    },
    { $unwind: '$product' },
    {
      $lookup: {
        from: 'categories',
        localField: 'product.category_id',
        foreignField: 'id',
        as: 'category',
      },
    },
    { $unwind: '$category' },
  ];

  const results = await invCol.aggregate(pipeline).toArray();
  if (!results.length) throw Errors.notFound();

  const doc = results[0];
  const lot = {
    id: doc.id,
    unit_id: doc.unit_id,
    item_id: doc.variant_id,
    item_name: doc.product.name,
    category: doc.category.name,
    qty_packs: doc.qty_packs,
    rate: doc.rate,
    acquired_on: doc.acquired_on,
    source: doc.source,
    is_active: doc.is_active,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  };

  return ok(lot);
});

export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;

  const invCol = await getCollection('unit_inventory');

  const existing = (await invCol.findOne({ id })) as Record<string, unknown> | null;
  if (!existing) throw Errors.notFound();

  const ctx = await requireApiCapability(req, 'inventory.write', existing.unit_id as string);
  await checkRateLimit(req, 'write', ctx.user.id);

  const bodyText = await req.text();
  const parsed = updateLotSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const { acquired_on, ...rest } = parsed.data;
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    ...rest,
    ...(acquired_on !== undefined
      ? { acquired_on: acquired_on ? acquired_on.toISOString().slice(0, 10) : null }
      : {}),
    updated_at: now,
    updated_by: ctx.user.id,
  };

  await invCol.updateOne({ id }, { $set: update });

  const updatedDoc = { ...existing, ...update };
  await writeAudit({
    table_name: 'unit_inventory',
    row_pk: id,
    op: 'UPDATE',
    active_unit_id: existing.unit_id,
    changed_by: ctx.user.id,
    old_data: existing,
    new_data: updatedDoc,
  });

  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 200, updatedDoc);
  return ok(updatedDoc);
});

export const DELETE = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;

  const invCol = await getCollection('unit_inventory');

  const existing = (await invCol.findOne({ id })) as Record<string, unknown> | null;
  if (!existing) throw Errors.notFound();

  const ctx = await requireApiCapability(req, 'inventory.write', existing.unit_id as string);
  await checkRateLimit(req, 'write', ctx.user.id);

  const now = new Date().toISOString();
  await invCol.updateOne({ id }, { $set: { is_active: false, updated_at: now, updated_by: ctx.user.id } });

  await writeAudit({
    table_name: 'unit_inventory',
    row_pk: id,
    op: 'UPDATE',
    active_unit_id: existing.unit_id,
    changed_by: ctx.user.id,
    old_data: existing,
    new_data: { ...existing, is_active: false, updated_at: now },
  });

  return noContent();
});
