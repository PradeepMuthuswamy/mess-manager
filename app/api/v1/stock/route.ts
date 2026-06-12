import { NextRequest } from 'next/server';
import { withRoute, list, created } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { createLotSchema, listInventoryQuerySchema } from '@/lib/schemas/inventory';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);

  const url = new URL(req.url);
  const parsed = listInventoryQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  // Scope to the caller's unit. Admins may target a specific unit via
  // ?unit_id=/X-Unit-Id (activeUnitId); in "all units" mode there is no
  // inventory roll-up in Phase 1 — return an empty page, never cross-unit rows.
  const unitId = parsed.data.unit_id ?? ctx.user.activeUnitId ?? ctx.user.homeUnitId ?? null;

  if (unitId === null) {
    return list([], null);
  }

  let q = ctx.supabase
    .from('v_unit_inventory_current')
    .select(
      'id, unit_id, item_id, item_name, category, pack_size_id, pack_label, kind, volume_ml, unit_count, qty_packs, rate, acquired_on, source, uom, is_active, created_at, created_by, updated_at, updated_by',
    )
    .eq('unit_id', unitId)
    .order('item_name')
    .order('rate')
    .limit(parsed.data.limit + 1);

  if (!parsed.data.include_inactive) q = q.eq('is_active', true);
  if (parsed.data.q) q = q.ilike('item_name', `%${parsed.data.q}%`);
  if (parsed.data.item_id) q = q.eq('item_id', parsed.data.item_id);

  const { data, error } = await q;
  if (error) throw Errors.internal(error.message);

  const hasMore = (data?.length ?? 0) > parsed.data.limit;
  const page = hasMore ? data!.slice(0, parsed.data.limit) : (data ?? []);
  return list(page, hasMore ? page[page.length - 1]?.id ?? null : null);
});

export const POST = withRoute(async (req: NextRequest) => {
  const bodyText = await req.text();
  const parsed = createLotSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  // Capability gate on the body's unit_id — unauthorized ⇒ 403 via Errors.
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'write', ctx.user.id);

  // Verify that the variant does not belong to the grocery category.
  const { data: variant, error: varErr } = await ctx.supabase
    .from('v_items_current')
    .select('category')
    .eq('id', parsed.data.pack_size_id)
    .maybeSingle();

  if (varErr) throw Errors.internal(varErr.message);
  if (!variant) throw Errors.notFound();
  if (variant.category === 'grocery') {
    throw Errors.validation({
      fieldErrors: {
        pack_size_id: ['Adding stock for grocery items is disabled'],
      },
    });
  }

  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const { data: lotRow, error: insErr } = await ctx.admin
    .from('unit_inventory')
    .insert({
      unit_id: parsed.data.unit_id,
      variant_id: parsed.data.pack_size_id,
      qty_packs: parsed.data.qty_packs,
      rate: parsed.data.rate,
      acquired_on: parsed.data.acquired_on
        ? parsed.data.acquired_on.toISOString().slice(0, 10)
        : null,
      source: parsed.data.source ?? null,
      created_by: ctx.user.id,
      updated_by: ctx.user.id,
    })
    .select()
    .single();
  if (insErr || !lotRow) throw Errors.internal(insErr?.message ?? 'create failed');

  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 201, lotRow);
  return created(lotRow, `/api/v1/stock/${lotRow.id}`);
});
