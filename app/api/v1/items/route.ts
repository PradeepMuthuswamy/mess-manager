import { NextRequest } from 'next/server';
import { withRoute, ok, created } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { createItemApiSchema, listItemsQuerySchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getIdempotencyKey, tryReplay, storeResponse } from '@/lib/api/idempotency';
import { getDb } from '@/lib/mongo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CATEGORY_ID_MAP: Record<string, string> = {
  alcohol: '00000000-0000-0000-0000-000000000001',
  soft_drink: '00000000-0000-0000-0000-000000000002',
  cigar: '00000000-0000-0000-0000-000000000003',
  ration: '00000000-0000-0000-0000-000000000005',
  grocery: '00000000-0000-0000-0000-000000000006',
};

const uomMap: Record<string, string> = {
  ML: 'ml',
  LITRE: 'l',
  GRAM: 'g',
  KG: 'kg',
  PIECE: 'piece',
};

export const GET = withRoute(async (req: NextRequest) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);
  const url = new URL(req.url);
  const parsed = listItemsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw Errors.validation(parsed.error.flatten());

  const db = await getDb();
  const catId = CATEGORY_ID_MAP[parsed.data.category];

  // 1. Get matching category IDs
  const categories = await db
    .collection('categories')
    .find({
      $or: [
        ...(catId ? [{ id: catId }, { parent_id: catId }] : []),
        { slug: parsed.data.category },
      ],
    })
    .toArray();
  const matchedCatIds = categories.map((c) => String(c.id || c._id));
  if (catId && !matchedCatIds.includes(catId)) matchedCatIds.push(catId);

  // 2. Query products
  const productFilter: Record<string, unknown> = {
    category_id: { $in: matchedCatIds },
  };
  if (parsed.data.q?.trim()) {
    const regex = new RegExp(parsed.data.q.trim(), 'i');
    productFilter.$or = [{ name: regex }, { name_normalized: regex }];
  }

  const products = await db.collection('products').find(productFilter).toArray();
  const prodMap = new Map(products.map((p) => [String(p.id || p._id), p]));
  const productIds = Array.from(prodMap.keys());

  // 3. Query variants
  const variantFilter: Record<string, unknown> = {
    product_id: { $in: productIds },
  };
  if (parsed.data.active_only) {
    variantFilter.is_active = { $ne: false };
  }

  const variants = await db.collection('product_variants').find(variantFilter).toArray();

  // 4. Resolve menu rates if unit is determined
  const effectiveUnit = parsed.data.unit_id !== undefined
    ? parsed.data.unit_id
    : (ctx.user.activeUnitId ?? ctx.user.homeUnitId ?? null);

  const menuRateMap = new Map<string, number>();
  if (effectiveUnit) {
    const variantIds = variants.map((v) => String(v.id || v._id));
    const rates = await db
      .collection('unit_menu_rates')
      .find({
        unit_id: effectiveUnit,
        variant_id: { $in: variantIds },
      })
      .sort({ effective_from: -1 })
      .toArray();

    for (const r of rates) {
      const vId = String(r.variant_id);
      if (!menuRateMap.has(vId)) {
        menuRateMap.set(vId, Number(r.rate));
      }
    }
  }

  // 5. Build items
  const items = variants.map((v) => {
    const vId = String(v.id || v._id);
    const prod = prodMap.get(String(v.product_id));
    const packKind = ['ML', 'LITRE'].includes(String(v.unit_type)) ? 'volume' : 'count';
    let volumeMl: number | null = null;
    if (v.unit_type === 'ML') volumeMl = Number(v.unit_value);
    else if (v.unit_type === 'LITRE') volumeMl = Number(v.unit_value) * 1000;
    const unitCount = v.unit_type === 'PIECE' ? Number(v.unit_value) : null;
    const packLabel = `${v.unit_value || 1} ${v.unit_type || ''} ${v.package_type || ''}`.trim();
    const rate = menuRateMap.get(vId) ?? null;

    return {
      id: vId,
      unit_id: null,
      category: parsed.data.category,
      name: prod?.name || '',
      sku: v.sku ?? null,
      uom: (v.unit_type && uomMap[v.unit_type]) || v.uom || 'piece',
      is_active: v.is_active ?? true,
      current_rate: rate,
      current_ration_scale: null,
      rate_valid_from: null,
      version_id: vId,
      created_at: v.created_at || new Date().toISOString(),
      updated_at: v.updated_at || new Date().toISOString(),
      pack_label: packLabel,
      pack_kind: packKind as 'volume' | 'count',
      volume_ml: volumeMl,
      unit_count: unitCount,
    };
  });

  // Sort
  const desc = parsed.data.sort.startsWith('-');
  const sortKey = parsed.data.sort.replace(/^-/, '') as 'name' | 'created_at' | 'updated_at';
  items.sort((a, b) => {
    const aVal = a[sortKey] || '';
    const bVal = b[sortKey] || '';
    const cmp = String(aVal).localeCompare(String(bVal));
    return desc ? -cmp : cmp;
  });

  const hasMore = items.length > parsed.data.limit;
  const page = hasMore ? items.slice(0, parsed.data.limit) : items;
  return ok({ data: page, meta: { next_cursor: null, has_more: hasMore } });
});

export const POST = withRoute(async (req: NextRequest) => {
  const bodyText = await req.text();
  const rawBody = JSON.parse(bodyText || 'null');

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

    category_id = parsed.data.category_id;
    name = parsed.data.name;
    description = parsed.data.description ?? null;
    unit_value = parsed.data.variant.unit_value;
    unit_type = parsed.data.variant.unit_type;
    package_type = parsed.data.variant.package_type;
    sku = parsed.data.variant.sku ?? null;
  } else {
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

    category_id = CATEGORY_ID_MAP[rawBody.category] ?? '00000000-0000-0000-0000-000000000006';
    name = String(rawBody.name);
    description = rawBody.notes ? String(rawBody.notes) : null;
    const mapped = mapUomToVariant(String(rawBody.uom));
    unit_value = mapped.unit_value;
    unit_type = mapped.unit_type as 'ML' | 'LITRE' | 'GRAM' | 'KG' | 'PIECE';
    package_type = mapped.package_type as 'BOTTLE' | 'CAN' | 'PACKET' | 'BOX' | 'LOOSE';
    sku = rawBody.sku ? String(rawBody.sku) : null;
  }

  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'write', ctx.user.id);

  const idemKey = getIdempotencyKey(req);
  if (idemKey) {
    const replay = await tryReplay(idemKey, ctx.user.id, bodyText);
    if (replay) return replay;
  }

  const db = await getDb();
  const nameNormalized = name.trim().toLowerCase();

  const existing = await db.collection('products').findOne({
    category_id,
    name_normalized: nameNormalized,
  });
  if (existing) {
    throw Errors.conflict('Product with that name already exists in this unit/category');
  }

  const now = new Date().toISOString();
  const productId = crypto.randomUUID();
  const variantId = crypto.randomUUID();

  await db.collection('products').insertOne({
    id: productId,
    category_id,
    name,
    name_normalized: nameNormalized,
    description,
    created_at: now,
    updated_at: now,
  });

  await db.collection('product_variants').insertOne({
    id: variantId,
    product_id: productId,
    unit_value,
    unit_type,
    package_type,
    sku,
    is_active: true,
    created_at: now,
    updated_at: now,
  });

  const resData = {
    id: variantId,
    unit_id: null,
    category_id,
    name,
    sku,
    unit_value,
    unit_type,
    package_type,
    is_active: true,
    created_at: now,
    updated_at: now,
  };

  if (idemKey) await storeResponse(idemKey, ctx.user.id, bodyText, 201, resData);
  return created(resData, `/api/v1/items/${variantId}`);
});
