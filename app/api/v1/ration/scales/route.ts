import { NextRequest } from 'next/server';
import { withRoute, ok, created } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiCapability } from '@/lib/api/auth';
import { createScaleSchema, listScalesQuerySchema } from '@/lib/schemas';
import { userHasCapability } from '@/lib/auth/capabilities';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';
import { getCollection } from '@/lib/mongo';
import { writeAudit } from '@/lib/audit/write-audit';
import type { RationScale } from '@/lib/ration/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);

  const url = new URL(req.url);
  const parsed = listScalesQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const unitId = parsed.data.unit_id ?? ctx.user.activeUnitId;
  if (!unitId) throw Errors.badRequest('unit_id is required');
  if (!userHasCapability(ctx.user, 'ration.read', unitId)) {
    throw Errors.forbidden('Requires capability: ration.read');
  }

  const col = await getCollection<RationScale>('ration_scales');
  const filter: Record<string, unknown> = { unit_id: unitId };
  if (parsed.data.active_only) filter.is_active = true;
  if (parsed.data.q) filter.name = { $regex: parsed.data.q, $options: 'i' };
  if (parsed.data.rank_class) filter.rank_class = parsed.data.rank_class;
  if (parsed.data.terrain) filter.terrain = parsed.data.terrain;

  const data = await col
    .find(filter)
    .sort({ rank_class: 1, terrain: 1, name: 1 })
    .limit(parsed.data.limit)
    .toArray();

  return ok({ data, meta: { next_cursor: null, has_more: false } });
});

export const POST = withRoute(async (req: NextRequest) => {
  const bodyText = await req.text();
  const parsed = createScaleSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const ctx = await requireApiCapability(req, 'ration.adjust', parsed.data.unit_id);
  await checkRateLimit(req, 'write', ctx.user.id);

  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const col = await getCollection<RationScale>('ration_scales');
  const existing = await col.findOne({
    unit_id: parsed.data.unit_id,
    rank_class: parsed.data.rank_class,
    terrain: parsed.data.terrain,
  });
  if (existing) {
    throw Errors.conflict('A scale for that rank class and terrain already exists in this unit');
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const doc: RationScale = {
    id,
    unit_id: parsed.data.unit_id,
    name: parsed.data.name,
    rank_class: parsed.data.rank_class,
    terrain: parsed.data.terrain,
    description: parsed.data.description ?? null,
    is_active: true,
    created_at: now,
    updated_at: now,
    created_by: ctx.user.id,
    updated_by: ctx.user.id,
  };

  await col.insertOne(doc);

  await writeAudit({
    table_name: 'ration_scales',
    row_pk: id,
    op: 'INSERT',
    changed_by: ctx.user.id,
    active_unit_id: parsed.data.unit_id,
    new_data: doc as never,
  });

  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 201, doc);
  return created(doc, `/api/v1/ration/scales/${doc.id}`);
});
