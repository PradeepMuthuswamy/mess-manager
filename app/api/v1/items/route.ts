import { NextRequest } from 'next/server';
import { withRoute, ok, created } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiCapability } from '@/lib/api/auth';
import { createItemSchema, listItemsQuerySchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);
  const url = new URL(req.url);
  const parsed = listItemsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  let q = ctx.supabase
    .from('v_items_current')
    .select('id, unit_id, category, name, sku, uom, is_active, current_rate, current_ration_scale, rate_valid_from, version_id, created_at, updated_at')
    .eq('category', parsed.data.category)
    .limit(parsed.data.limit + 1);

  if (parsed.data.active_only) q = q.eq('is_active', true);

  // Unit scoping
  if (ctx.user.role !== 'admin') {
    const u = ctx.user.activeUnitId;
    if (u) q = q.or(`unit_id.is.null,unit_id.eq.${u}`);
    else q = q.is('unit_id', null);
  } else if (parsed.data.unit_id !== undefined) {
    if (parsed.data.unit_id === null) q = q.is('unit_id', null);
    else q = q.eq('unit_id', parsed.data.unit_id);
  }

  if (parsed.data.q) q = q.ilike('name', `%${parsed.data.q}%`);

  // Sort
  const desc = parsed.data.sort.startsWith('-');
  const col = parsed.data.sort.replace(/^-/, '');
  q = q.order(col, { ascending: !desc }).order('id', { ascending: !desc });

  const { data, error } = await q;
  if (error) throw Errors.internal(error.message);

  const hasMore = (data?.length ?? 0) > parsed.data.limit;
  const page = hasMore ? data!.slice(0, parsed.data.limit) : (data ?? []);
  return ok({ data: page, meta: { next_cursor: null, has_more: hasMore } });
});

export const POST = withRoute(async (req: NextRequest) => {
  const bodyText = await req.text();
  const parsed = createItemSchema.safeParse(JSON.parse(bodyText || 'null'));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const cap = parsed.data.unit_id ? 'masters.write' : 'masters.write.global';
  const ctx = await requireApiCapability(req, cap, parsed.data.unit_id ?? null);
  await checkRateLimit(req, 'write', ctx.user.id);

  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const { data: itemRow, error: insErr } = await ctx.admin.from('items').insert({
    unit_id: parsed.data.unit_id ?? null,
    category: parsed.data.category,
    name: parsed.data.name,
    sku: parsed.data.sku ?? null,
    uom: parsed.data.uom,
  }).select().single();
  if (insErr?.code === '23505') throw Errors.conflict('Item with that name already exists in this unit/category');
  if (insErr || !itemRow) throw Errors.internal(insErr?.message ?? 'create failed');

  const { error: rpcErr } = await ctx.admin.rpc('set_item_rate', {
    p_item_id: itemRow.id,
    p_rate: parsed.data.initial_rate,
    ...(parsed.data.initial_ration_scale != null ? { p_ration_scale: parsed.data.initial_ration_scale } : {}),
    ...(parsed.data.notes != null ? { p_notes: parsed.data.notes } : {}),
    p_effective_at: new Date().toISOString(),
  });
  if (rpcErr) throw Errors.internal(rpcErr.message);

  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 201, itemRow);
  return created(itemRow, `/api/v1/items/${itemRow.id}`);
});
