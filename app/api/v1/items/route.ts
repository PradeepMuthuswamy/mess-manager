/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server';
import { withRoute, ok, created } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { createItemApiSchema, listItemsQuerySchema } from '@/lib/schemas';
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
    .select('id, unit_id, category, name, sku, uom, is_active, current_rate, current_ration_scale, rate_valid_from, version_id, created_at, updated_at, pack_label, pack_kind, volume_ml, unit_count')
    .eq('category', parsed.data.category)
    .limit(parsed.data.limit + 1);

  if (parsed.data.active_only) q = q.eq('is_active', true);

  // Unit scoping
  if (parsed.data.unit_id !== undefined) {
    if (parsed.data.unit_id === null) q = q.is('unit_id', null);
    else q = q.eq('unit_id', parsed.data.unit_id);
  } else {
    const u = ctx.user.activeUnitId ?? ctx.user.homeUnitId;
    if (u) q = q.or(`unit_id.is.null,unit_id.eq.${u}`);
    else q = q.is('unit_id', null);
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
  const rawBody = JSON.parse(bodyText || 'null');

  let unit_id: string | null = null;
  let category_id = '';
  let name = '';
  let description: string | null = null;
  let unit_value = 1.0;
  let unit_type: 'ML' | 'LITRE' | 'GRAM' | 'KG' | 'PIECE' = 'PIECE';
  let package_type: 'BOTTLE' | 'CAN' | 'PACKET' | 'BOX' | 'LOOSE' = 'LOOSE';
  let sku: string | null = null;

  if (rawBody && typeof rawBody === 'object' && 'variant' in rawBody) {
    const parsed = createItemApiSchema.safeParse(rawBody);
    if (!parsed.success) throw Errors.validation(parsed.error.flatten());

    unit_id = parsed.data.unit_id ?? null;
    category_id = parsed.data.category_id;
    name = parsed.data.name;
    description = parsed.data.description ?? null;
    unit_value = parsed.data.variant.unit_value;
    unit_type = parsed.data.variant.unit_type;
    package_type = parsed.data.variant.package_type;
    sku = parsed.data.variant.sku ?? null;
  } else {
    const CATEGORY_ID_MAP: Record<string, string> = {
      alcohol: '00000000-0000-0000-0000-000000000001',
      soft_drink: '00000000-0000-0000-0000-000000000002',
      cigar: '00000000-0000-0000-0000-000000000003',
      ration: '00000000-0000-0000-0000-000000000005',
      grocery: '00000000-0000-0000-0000-000000000006',
    };
    const mapUomToVariant = (uom: string) => {
      switch (uom) {
        case 'kg': return { unit_value: 1.0, unit_type: 'KG', package_type: 'LOOSE' };
        case 'g': return { unit_value: 1.0, unit_type: 'GRAM', package_type: 'LOOSE' };
        case 'l': return { unit_value: 1.0, unit_type: 'LITRE', package_type: 'LOOSE' };
        case 'ml': return { unit_value: 1.0, unit_type: 'ML', package_type: 'LOOSE' };
        case 'bottle': return { unit_value: 1.0, unit_type: 'PIECE', package_type: 'BOTTLE' };
        case 'pack': return { unit_value: 1.0, unit_type: 'PIECE', package_type: 'PACKET' };
        default: return { unit_value: 1.0, unit_type: 'PIECE', package_type: 'LOOSE' };
      }
    };

    if (!rawBody || typeof rawBody !== 'object') throw Errors.validation({ formErrors: ['Invalid payload'] });
    if (!rawBody.name || !rawBody.category || !rawBody.uom) {
      throw Errors.validation({ formErrors: ['Missing name, category or uom in payload'] });
    }

    unit_id = rawBody.unit_id ?? null;
    category_id = CATEGORY_ID_MAP[rawBody.category] ?? '00000000-0000-0000-0000-000000000006';
    name = String(rawBody.name);
    description = rawBody.notes ? String(rawBody.notes) : null;
    const mapped = mapUomToVariant(String(rawBody.uom));
    unit_value = mapped.unit_value;
    unit_type = mapped.unit_type as any;
    package_type = mapped.package_type as any;
    sku = rawBody.sku ? String(rawBody.sku) : null;
  }

  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'write', ctx.user.id);

  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const { data: productRow, error: prodErr } = await ctx.admin
    .from('products')
    .insert({
      unit_id: unit_id ?? null,
      category_id,
      name,
      description,
    })
    .select()
    .single();

  if (prodErr?.code === '23505') throw Errors.conflict('Product with that name already exists in this unit/category');
  if (prodErr || !productRow) throw Errors.internal(prodErr?.message ?? 'Product insert failed');

  const { data: variantRow, error: varErr } = await ctx.admin
    .from('product_variants')
    .insert({
      product_id: productRow.id,
      unit_value,
      unit_type,
      package_type,
      sku,
    })
    .select()
    .single();

  if (varErr || !variantRow) {
    await ctx.admin.from('products').delete().eq('id', productRow.id);
    throw Errors.internal(varErr?.message ?? 'Variant insert failed');
  }

  const resData = {
    id: variantRow.id,
    unit_id: productRow.unit_id,
    category_id: productRow.category_id,
    name: productRow.name,
    sku: variantRow.sku,
    unit_value: variantRow.unit_value,
    unit_type: variantRow.unit_type,
    package_type: variantRow.package_type,
    is_active: variantRow.is_active,
    created_at: variantRow.created_at,
    updated_at: variantRow.updated_at,
  };

  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 201, resData);
  return created(resData, `/api/v1/items/${variantRow.id}`);
});
