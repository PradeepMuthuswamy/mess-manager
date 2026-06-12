/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server';
import { withRoute, ok, noContent } from '@/lib/api/handler';
import { Errors } from '@/lib/api/errors';
import { requireApiUser, requireApiCapability } from '@/lib/api/auth';
import { updateProductSchema, updateVariantSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctx = await requireApiUser(req);
  const { id } = await params;
  const { data, error } = await ctx.supabase.from('v_items_current').select('*').eq('id', id).maybeSingle();
  if (error) throw Errors.internal(error.message);
  if (!data) throw Errors.notFound();
  return ok(data);
});

export const PATCH = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctxUser = await requireApiUser(req);
  const { id } = await params;

  const { data: variantRow } = await ctxUser.supabase
    .from('product_variants')
    .select('id, product_id')
    .eq('id', id)
    .maybeSingle();
  if (!variantRow) throw Errors.notFound();

  const { data: productRow } = await ctxUser.supabase
    .from('products')
    .select('id, unit_id, category_id, name, description')
    .eq('id', variantRow.product_id)
    .maybeSingle();
  if (!productRow) throw Errors.notFound();

  const cap = productRow.unit_id ? 'masters.write' : 'masters.write.global';
  const ctx = await requireApiCapability(req, cap, productRow.unit_id ?? null);

  const body = await req.json().catch(() => null);
  if (!body) throw Errors.validation({ formErrors: ['Missing body'] });

  const productUpdate: Record<string, any> = {};
  if (body.name !== undefined) productUpdate.name = body.name;
  if (body.description !== undefined) productUpdate.description = body.description;
  if (body.category_id !== undefined) productUpdate.category_id = body.category_id;

  if (Object.keys(productUpdate).length > 0) {
    const productParsed = updateProductSchema.safeParse(productUpdate);
    if (!productParsed.success) throw Errors.validation(productParsed.error.flatten());

    const { error: prodUpErr } = await ctx.admin
      .from('products')
      .update(productParsed.data)
      .eq('id', productRow.id);
    if (prodUpErr) throw Errors.internal(prodUpErr.message);
  }

  const variantUpdate: Record<string, any> = {};
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

    const { error: varUpErr } = await ctx.admin
      .from('product_variants')
      .update(variantParsed.data)
      .eq('id', variantRow.id);
    if (varUpErr) throw Errors.internal(varUpErr.message);
  }

  const { data: updatedItem, error: fetchErr } = await ctx.supabase
    .from('v_items_current')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchErr) throw Errors.internal(fetchErr.message);

  return ok(updatedItem);
});

export const DELETE = withRoute(async (req: NextRequest, { params }: Ctx) => {
  const ctxUser = await requireApiUser(req);
  const { id } = await params;

  const { data: variantRow } = await ctxUser.supabase
    .from('product_variants')
    .select('id, product_id')
    .eq('id', id)
    .maybeSingle();
  if (!variantRow) throw Errors.notFound();

  const { data: productRow } = await ctxUser.supabase
    .from('products')
    .select('unit_id')
    .eq('id', variantRow.product_id)
    .maybeSingle();
  if (!productRow) throw Errors.notFound();

  const cap = productRow.unit_id ? 'masters.write' : 'masters.write.global';
  const ctx = await requireApiCapability(req, cap, productRow.unit_id ?? null);

  const { error } = await ctx.admin
    .from('product_variants')
    .update({ is_active: false })
    .eq('id', id);
  if (error) throw Errors.internal(error.message);

  return noContent();
});
