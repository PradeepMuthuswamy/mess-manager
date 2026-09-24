import { NextRequest } from 'next/server';
import { withRoute, list, created } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiCapability } from '@/lib/api/auth';
import { createLotSchema, listInventoryQuerySchema } from '@/lib/schemas/inventory';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';
import { listInventory } from '@/lib/inventory/queries';
import { getCollection } from '@/lib/mongo';
import { writeAudit } from '@/lib/audit/write-audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);

  const url = new URL(req.url);
  const parsed = listInventoryQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  let unitId: string | null;
  if (ctx.user.role === 'super_admin') {
    unitId = parsed.data.unit_id ?? ctx.user.activeUnitId ?? null;
  } else {
    unitId = ctx.user.activeUnitId;
    if (parsed.data.unit_id && parsed.data.unit_id !== unitId) {
      await requireApiCapability(req, 'inventory.read', parsed.data.unit_id);
      unitId = parsed.data.unit_id;
    }
  }

  if (unitId === null) {
    return list([], null);
  }

  const { rows } = await listInventory(unitId, {
    includeInactive: parsed.data.include_inactive,
    q: parsed.data.q,
    itemId: parsed.data.item_id,
  });

  const hasMore = rows.length > parsed.data.limit;
  const page = hasMore ? rows.slice(0, parsed.data.limit) : rows;
  return list(page, hasMore ? page[page.length - 1]?.id ?? null : null);
});

export const POST = withRoute(async (req: NextRequest) => {
  const bodyText = await req.text();
  const parsed = createLotSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const ctx = await requireApiCapability(req, 'inventory.write', parsed.data.unit_id);
  await checkRateLimit(req, 'write', ctx.user.id);

  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const invCol = await getCollection('unit_inventory');

  const now = new Date().toISOString();
  const lotId = crypto.randomUUID();

  const lotDoc = {
    id: lotId,
    unit_id: parsed.data.unit_id,
    variant_id: parsed.data.pack_size_id,
    qty_packs: parsed.data.qty_packs,
    rate: parsed.data.rate,
    acquired_on: parsed.data.acquired_on
      ? parsed.data.acquired_on.toISOString().slice(0, 10)
      : now.slice(0, 10),
    source: parsed.data.source ?? null,
    is_active: true,
    created_at: now,
    updated_at: now,
    created_by: ctx.user.id,
    updated_by: ctx.user.id,
  };

  await invCol.insertOne(lotDoc);

  await writeAudit({
    table_name: 'unit_inventory',
    row_pk: lotId,
    op: 'INSERT',
    active_unit_id: parsed.data.unit_id,
    changed_by: ctx.user.id,
    new_data: lotDoc,
  });

  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 201, lotDoc);
  return created(lotDoc, `/api/v1/inventory/${lotDoc.id}`);
});
