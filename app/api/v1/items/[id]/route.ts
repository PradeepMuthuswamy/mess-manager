import { NextRequest } from 'next/server';
import { withRoute, ok, noContent } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/auth';
import { updateProductSchema, updateVariantSchema } from '@/lib/schemas';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getDb } from '@/lib/mongo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

const uomMap: Record<string, string> = {
  ML: 'ml',
  LITRE: 'l',
  GRAM: 'g',
  KG: 'kg',
  PIECE: 'piece',
};

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'read', ctx.user.id);
  const { id } = await params;
  const db = await getDb();

  const variant = await db.collection('product_variants').findOne({ id });
  if (!variant) throw Errors.notFound();

  const product = await db.collection('products').findOne({ id: variant.product_id });
  if (!product) throw Errors.notFound();

  const category = await db.collection('categories').findOne({ id: product.category_id });

  const packKind = ['ML', 'LITRE'].includes(String(variant.unit_type)) ? 'volume' : 'count';
  let volumeMl: number | null = null;
  if (variant.unit_type === 'ML') volumeMl = Number(variant.unit_value);
  else if (variant.unit_type === 'LITRE') volumeMl = Number(variant.unit_value) * 1000;
  const unitCount = variant.unit_type === 'PIECE' ? Number(variant.unit_value) : null;
  const packLabel = `${variant.unit_value || 1} ${variant.unit_type || ''} ${variant.package_type || ''}`.trim();

  let currentRate: number | null = null;
  const u = ctx.user.activeUnitId ?? ctx.user.homeUnitId;
  if (u) {
    const rateDoc = await db.collection('unit_menu_rates').findOne(
      { unit_id: u, variant_id: id },
      { sort: { effective_from: -1 } },
    );
    if (rateDoc) currentRate = Number(rateDoc.rate);
  }

  const data = {
    id: String(variant.id || variant._id),
    unit_id: null,
    category: category?.slug || category?.name || 'grocery',
    category_id: product.category_id,
    name: product.name,
    sku: variant.sku ?? null,
    uom: (variant.unit_type && uomMap[variant.unit_type]) || variant.uom || 'piece',
    unit_value: variant.unit_value,
    unit_type: variant.unit_type,
    package_type: variant.package_type,
    is_active: variant.is_active ?? true,
    current_rate: currentRate,
    current_ration_scale: null,
    rate_valid_from: null,
    version_id: String(variant.id || variant._id),
    created_at: variant.created_at || new Date().toISOString(),
    updated_at: variant.updated_at || new Date().toISOString(),
    pack_label: packLabel,
    pack_kind: packKind,
    volume_ml: volumeMl,
    unit_count: unitCount,
  };

  return ok(data);
});

export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'write', ctx.user.id);
  const { id } = await params;
  const db = await getDb();

  const variantRow = await db.collection('product_variants').findOne({ id });
  if (!variantRow) throw Errors.notFound();

  const productRow = await db.collection('products').findOne({ id: variantRow.product_id });
  if (!productRow) throw Errors.notFound();

  const body = await req.json().catch(() => null);
  if (!body) throw Errors.validation({ formErrors: ['Missing body'] });

  const now = new Date().toISOString();
  const productUpdate: Record<string, unknown> = {};
  if (body.name !== undefined) {
    productUpdate.name = body.name;
    productUpdate.name_normalized = String(body.name).trim().toLowerCase();
  }
  if (body.description !== undefined) productUpdate.description = body.description;
  if (body.category_id !== undefined) productUpdate.category_id = body.category_id;

  if (Object.keys(productUpdate).length > 0) {
    const productParsed = updateProductSchema.safeParse(productUpdate);
    if (!productParsed.success) throw Errors.validation(productParsed.error.flatten());

    productUpdate.updated_at = now;
    await db.collection('products').updateOne({ id: productRow.id }, { $set: productUpdate });
  }

  const variantUpdate: Record<string, unknown> = {};
  if (body.sku !== undefined) variantUpdate.sku = body.sku;
  if (body.is_active !== undefined) variantUpdate.is_active = body.is_active;
  if (body.unit_value !== undefined) variantUpdate.unit_value = body.unit_value;
  if (body.unit_type !== undefined) variantUpdate.unit_type = body.unit_type;
  if (body.package_type !== undefined) variantUpdate.package_type = body.package_type;

  if (body.uom !== undefined && body.unit_type === undefined) {
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
    const mapped = mapUomToVariant(String(body.uom));
    variantUpdate.unit_value = mapped.unit_value;
    variantUpdate.unit_type = mapped.unit_type;
    variantUpdate.package_type = mapped.package_type;
  }

  if (Object.keys(variantUpdate).length > 0) {
    const variantParsed = updateVariantSchema.safeParse(variantUpdate);
    if (!variantParsed.success) throw Errors.validation(variantParsed.error.flatten());

    variantUpdate.updated_at = now;
    await db.collection('product_variants').updateOne({ id: variantRow.id }, { $set: variantUpdate });
  }

  const updatedVariant = await db.collection('product_variants').findOne({ id });
  const updatedProduct = await db.collection('products').findOne({ id: updatedVariant?.product_id });

  return ok({
    ...updatedProduct,
    ...updatedVariant,
    id: updatedVariant?.id,
    product_id: updatedProduct?.id,
    name: updatedProduct?.name,
  });
});

export const DELETE = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  await checkRateLimit(req, 'write', ctx.user.id);
  const { id } = await params;
  const db = await getDb();

  const variantRow = await db.collection('product_variants').findOne({ id });
  if (!variantRow) throw Errors.notFound();

  const now = new Date().toISOString();
  await db.collection('product_variants').updateOne({ id }, { $set: { is_active: false, updated_at: now } });

  return noContent();
});
