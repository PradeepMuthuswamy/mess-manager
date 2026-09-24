'use server';


import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireCapability, userHasCapability } from '@/lib/auth/require-capability';
import {
  updateProductSchema,
  updateVariantSchema,
  itemCategorySchema,
  createItemApiSchema,
  adoptVariantSchema,
  unadoptVariantSchema,
  setUnitMenuRateSchema,
} from '@/lib/schemas/items';
import { bulkImportRowSchema, type BulkImportRow } from './bulk-import';
import type { Category } from './categories';
import type { AuthUser } from '@/lib/auth/types';
import type { Database } from '@/lib/supabase/database.types';

type ProductUpdate = Database['public']['Tables']['products']['Update'];
type VariantUpdate = Database['public']['Tables']['product_variants']['Update'];

type ActionResult = {
  ok?: boolean;
  error?: string;
  id?: string;
  details?: unknown;
};

export type BulkImportResult = {
  total: number;
  inserted: number;
  failed: number;
  errors: Array<{ rowNumber: number; name: string; message: string }>;
};

function revalidateMasters() {
  // Masters now render across split surfaces (/masters is a pure redirect hub
  // with no data). Revalidate every surface so create/update/import refresh
  // the visible tables regardless of which category was mutated.
  revalidatePath('/ration/masters');
  revalidatePath('/bar/masters');
  revalidatePath('/grocery');
  revalidatePath('/stock');
  revalidatePath('/grocery/stock');
  revalidatePath('/ration');
}

const CATEGORY_ID_MAP: Record<string, string> = {
  alcohol: '00000000-0000-0000-0000-000000000001',
  soft_drink: '00000000-0000-0000-0000-000000000002',
  cigar: '00000000-0000-0000-0000-000000000003',
  ration: '00000000-0000-0000-0000-000000000005',
  grocery: '00000000-0000-0000-0000-000000000006',
};

const INVENTORY_RATE_CATEGORIES = new Set<Category>([
  'alcohol',
  'soft_drink',
  'cigar',
  'grocery',
]);

function mapUomToVariant(uom: string): {
  unit_value: number;
  unit_type: 'ML' | 'LITRE' | 'GRAM' | 'KG' | 'PIECE';
  package_type: 'BOTTLE' | 'CAN' | 'PACKET' | 'BOX' | 'LOOSE';
} {
  switch (uom) {
    case 'kg':
      return { unit_value: 1.0, unit_type: 'KG', package_type: 'LOOSE' };
    case 'g':
      return { unit_value: 1.0, unit_type: 'GRAM', package_type: 'LOOSE' };
    case 'l':
      return { unit_value: 1.0, unit_type: 'LITRE', package_type: 'LOOSE' };
    case 'ml':
      return { unit_value: 1.0, unit_type: 'ML', package_type: 'LOOSE' };
    case 'bottle':
      return { unit_value: 1.0, unit_type: 'PIECE', package_type: 'BOTTLE' };
    case 'pack':
      return { unit_value: 1.0, unit_type: 'PIECE', package_type: 'PACKET' };
    case 'piece':
    default:
      return { unit_value: 1.0, unit_type: 'PIECE', package_type: 'LOOSE' };
  }
}

function formString(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  if (raw == null) return null;
  const value = String(raw).trim();
  return value === '' ? null : value;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function canWriteGlobal(user: AuthUser): boolean {
  return userHasCapability(user, 'masters.write.global', null);
}

function resolveActorUnit(user: AuthUser, unitId?: string | null): string | null {
  return unitId ?? user.activeUnitId ?? user.homeUnitId ?? null;
}

type VariantShape = {
  unit_value: number;
  unit_type: 'ML' | 'LITRE' | 'GRAM' | 'KG' | 'PIECE';
  package_type: 'BOTTLE' | 'CAN' | 'PACKET' | 'BOX' | 'LOOSE';
  sku?: string | null;
};

async function findGlobalProduct(
  supabase: Awaited<ReturnType<typeof createClient>>,
  categoryId: string,
  name: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('products')
    .select('id')
    .eq('category_id', categoryId)
    .eq('name_normalized', name.trim().toLowerCase())
    .maybeSingle();
  return data ?? null;
}

async function findMatchingVariant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productId: string,
  shape: VariantShape,
): Promise<{ id: string } | null> {
  if (shape.sku) {
    const { data: bySku } = await supabase
      .from('product_variants')
      .select('id')
      .eq('product_id', productId)
      .eq('sku', shape.sku)
      .maybeSingle();
    if (bySku) return bySku;
  }

  const { data: byIdentity } = await supabase
    .from('product_variants')
    .select('id')
    .eq('product_id', productId)
    .eq('unit_value', shape.unit_value)
    .eq('unit_type', shape.unit_type)
    .eq('package_type', shape.package_type)
    .maybeSingle();
  if (byIdentity) return byIdentity;

  const { data: only } = await supabase
    .from('product_variants')
    .select('id')
    .eq('product_id', productId);
  if (only?.length === 1) return only[0];
  return null;
}

async function insertGlobalProduct(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: { category_id: string; name: string; description?: string | null },
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from('products')
    .insert({
      category_id: input.category_id,
      name: input.name,
      description: input.description ?? null,
    })
    .select('id')
    .single();

  if (error?.code === '23505') {
    const existing = await findGlobalProduct(supabase, input.category_id, input.name);
    if (existing) return existing;
  }
  if (error || !data) return { error: error?.message ?? 'Could not create product' };
  return data;
}

async function insertGlobalVariant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productId: string,
  shape: VariantShape,
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from('product_variants')
    .insert({
      product_id: productId,
      unit_value: shape.unit_value,
      unit_type: shape.unit_type,
      package_type: shape.package_type,
      sku: shape.sku ?? null,
    })
    .select('id')
    .single();

  if (error?.code === '23505') {
    const existing = await findMatchingVariant(supabase, productId, shape);
    if (existing) return existing;
  }
  if (error || !data) return { error: error?.message ?? 'Could not create variant' };
  return data;
}

async function upsertUnitCatalog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: { unit_id: string; variant_id: string; local_sku?: string | null; is_enabled?: boolean },
): Promise<{ error?: string }> {
  const { error } = await supabase.from('unit_catalog').upsert(
    {
      unit_id: input.unit_id,
      variant_id: input.variant_id,
      is_enabled: input.is_enabled ?? true,
      local_sku: input.local_sku ?? null,
    },
    { onConflict: 'unit_id,variant_id' },
  );
  return error ? { error: error.message } : {};
}

async function persistImportRate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    unitId: string;
    variantId: string;
    category: Category;
    row: BulkImportRow;
  },
): Promise<{ error?: string }> {
  if (input.category === 'ration') {
    const { data: scales, error: scaleErr } = await supabase
      .from('ration_scales')
      .select('id')
      .eq('unit_id', input.unitId)
      .eq('is_active', true);
    if (scaleErr) return { error: scaleErr.message };
    if (!scales || scales.length === 0) {
      return { error: 'No active ration scale for this unit' };
    }

    const qty = input.row.ration_scale ?? input.row.rate;
    const effective = new Date().toISOString();
    for (const scale of scales) {
      const { error: rpcErr } = await supabase.rpc('set_ration_scale_item', {
        p_scale_id: scale.id,
        p_variant_id: input.variantId,
        p_auth_qty: qty,
        p_uom: input.row.uom,
        ...(input.row.notes ? { p_notes: input.row.notes } : {}),
        p_effective_at: effective,
      });
      if (rpcErr) return { error: rpcErr.message };
    }
    return {};
  }

  if (!INVENTORY_RATE_CATEGORIES.has(input.category)) {
    return { error: `Cannot persist rate for category ${input.category}` };
  }

  const { error } = await supabase.from('unit_inventory').insert({
    unit_id: input.unitId,
    variant_id: input.variantId,
    qty_packs: 0,
    rate: input.row.rate,
    acquired_on: todayIsoDate(),
    source: 'bulk_import',
  });
  return error ? { error: error.message } : {};
}

export async function createGlobalProductAction(input: unknown): Promise<ActionResult> {
  const parsed = createItemApiSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid product input', details: parsed.error.flatten() };
  }

  await requireCapability('masters.write.global', null);

  const supabase = await createClient();
  const product = await insertGlobalProduct(supabase, {
    category_id: parsed.data.category_id,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
  });
  if ('error' in product) return { error: product.error };

  const variant = await insertGlobalVariant(supabase, product.id, parsed.data.variant);
  if ('error' in variant) {
    await supabase.from('products').delete().eq('id', product.id);
    return { error: variant.error };
  }

  revalidateMasters();
  return { ok: true, id: variant.id };
}

export async function adoptVariantAction(input: unknown): Promise<ActionResult> {
  const parsed = adoptVariantSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid adopt input', details: parsed.error.flatten() };
  }

  await requireCapability('masters.write', parsed.data.unit_id);

  const supabase = await createClient();
  const { data: variant, error: varErr } = await supabase
    .from('product_variants')
    .select('id')
    .eq('id', parsed.data.variant_id)
    .maybeSingle();
  if (varErr) return { error: varErr.message };
  if (!variant) return { error: 'Variant not found' };

  const adopted = await upsertUnitCatalog(supabase, parsed.data);
  if (adopted.error) return { error: adopted.error };

  revalidateMasters();
  return { ok: true, id: parsed.data.variant_id };
}

export async function unadoptVariantAction(input: unknown): Promise<ActionResult> {
  const parsed = unadoptVariantSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid unadopt input', details: parsed.error.flatten() };
  }

  await requireCapability('masters.write', parsed.data.unit_id);

  const supabase = await createClient();
  if (parsed.data.hard) {
    const { error } = await supabase
      .from('unit_catalog')
      .delete()
      .eq('unit_id', parsed.data.unit_id)
      .eq('variant_id', parsed.data.variant_id);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from('unit_catalog')
      .update({ is_enabled: false })
      .eq('unit_id', parsed.data.unit_id)
      .eq('variant_id', parsed.data.variant_id)
      .select('id')
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: 'Adoption not found' };
  }

  revalidateMasters();
  return { ok: true, id: parsed.data.variant_id };
}

export async function setUnitMenuRateAction(input: unknown): Promise<ActionResult> {
  const parsed = setUnitMenuRateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid menu rate input', details: parsed.error.flatten() };
  }

  await requireCapability('masters.write', parsed.data.unit_id);

  const supabase = await createClient();
  const { error } = await supabase.from('unit_menu_rates').upsert(
    {
      unit_id: parsed.data.unit_id,
      variant_id: parsed.data.variant_id,
      rate: parsed.data.rate,
      effective_from: parsed.data.effective_from,
    },
    { onConflict: 'unit_id,variant_id,effective_from' },
  );
  if (error) return { error: error.message };

  revalidateMasters();
  return { ok: true };
}

/**
 * Ops path: adopt an existing global variant into unit_catalog.
 * Global path (no unit_id): create product + variant. Prefer createGlobalProductAction.
 */
export async function createMasterItemAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const unit_id = formString(formData, 'unit_id');
  const variant_id = formString(formData, 'variant_id');

  if (unit_id) {
    await requireCapability('masters.write', unit_id);

    let resolvedVariantId = variant_id;
    if (!resolvedVariantId) {
      const categoryRaw = formString(formData, 'category') ?? '';
      const category_id = CATEGORY_ID_MAP[categoryRaw] || formString(formData, 'category_id');
      const name = formString(formData, 'name');
      if (!category_id || !name) {
        return { error: 'variant_id is required to adopt a catalog item' };
      }

      const supabase = await createClient();
      const product = await findGlobalProduct(supabase, category_id, name);
      if (!product) {
        return {
          error: `No global product named "${name}". Ops cannot create products — ask Admin to add it, then adopt.`,
        };
      }

      const uom = formString(formData, 'uom');
      const shape: VariantShape = uom && !formString(formData, 'unit_type')
        ? { ...mapUomToVariant(uom), sku: formString(formData, 'sku') }
        : {
            unit_value: Number(formData.get('unit_value') ?? 1.0),
            unit_type: String(formData.get('unit_type') ?? 'PIECE') as VariantShape['unit_type'],
            package_type: String(formData.get('package_type') ?? 'LOOSE') as VariantShape['package_type'],
            sku: formString(formData, 'sku'),
          };

      const variant = await findMatchingVariant(supabase, product.id, shape);
      if (!variant) {
        return {
          error: `No matching variant for "${name}". Ops cannot create variants — ask Admin to add it, then adopt.`,
        };
      }
      resolvedVariantId = variant.id;
    }

    return adoptVariantAction({
      unit_id,
      variant_id: resolvedVariantId,
      local_sku: formString(formData, 'sku'),
    });
  }

  await requireCapability('masters.write.global', null);

  const categoryRaw = formString(formData, 'category') ?? '';
  const category_id = CATEGORY_ID_MAP[categoryRaw] || formString(formData, 'category_id') || '';
  const name = formString(formData, 'name') ?? '';
  const description = formString(formData, 'notes') ?? formString(formData, 'description');

  const uom = formString(formData, 'uom');
  const variantData = uom && !formString(formData, 'unit_type')
    ? mapUomToVariant(uom)
    : {
        unit_value: Number(formData.get('unit_value') ?? 1.0),
        unit_type: String(formData.get('unit_type') ?? 'PIECE'),
        package_type: String(formData.get('package_type') ?? 'LOOSE'),
      };

  return createGlobalProductAction({
    category_id,
    name,
    description,
    variant: {
      ...variantData,
      sku: formString(formData, 'sku'),
    },
  });
}

export async function updateMasterItemAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const id = formString(formData, 'id');
  if (!id) return { error: 'Missing id' };

  const unit_id = formString(formData, 'unit_id');
  const user = unit_id
    ? await requireCapability('masters.write', unit_id)
    : await requireCapability('masters.write');
  const globalWrite = canWriteGlobal(user);
  const effectiveUnit = resolveActorUnit(user, unit_id);

  const supabase = await createClient();
  const { data: variantRow } = await supabase
    .from('product_variants')
    .select('id, product_id')
    .eq('id', id)
    .single();
  if (!variantRow) return { error: 'Variant not found' };

  const { data: productRow } = await supabase
    .from('products')
    .select('id, category_id')
    .eq('id', variantRow.product_id)
    .single();
  if (!productRow) return { error: 'Product not found' };

  if (effectiveUnit) {
    const localSku = formString(formData, 'local_sku') ?? formString(formData, 'sku');
    const isActiveVal = formData.get('is_active');
    const is_enabled = isActiveVal == null ? undefined : String(isActiveVal) === 'true';
    const catalogPatch: { local_sku?: string | null; is_enabled?: boolean } = {};
    if (localSku !== null || formData.get('local_sku') != null || formData.get('sku') != null) {
      catalogPatch.local_sku = localSku;
    }
    if (is_enabled !== undefined) catalogPatch.is_enabled = is_enabled;

    if (Object.keys(catalogPatch).length > 0) {
      const { data: existing } = await supabase
        .from('unit_catalog')
        .select('id')
        .eq('unit_id', effectiveUnit)
        .eq('variant_id', variantRow.id)
        .maybeSingle();
      if (existing) {
        const { error: catErr } = await supabase
          .from('unit_catalog')
          .update(catalogPatch)
          .eq('id', existing.id);
        if (catErr) return { error: catErr.message };
      } else {
        const adopted = await upsertUnitCatalog(supabase, {
          unit_id: effectiveUnit,
          variant_id: variantRow.id,
          ...catalogPatch,
        });
        if (adopted.error) return { error: adopted.error };
      }
    }

    const rateRaw = formString(formData, 'rate');
    if (rateRaw != null) {
      const rateResult = await setUnitMenuRateAction({
        unit_id: effectiveUnit,
        variant_id: variantRow.id,
        rate: Number(rateRaw),
        effective_from: formString(formData, 'effective_from') ?? todayIsoDate(),
      });
      if (rateResult.error) return rateResult;
    }
  }

  const name = formString(formData, 'name') ?? undefined;
  const description = formData.get('description') !== null && formData.get('description') !== undefined
    ? String(formData.get('description'))
    : (formString(formData, 'notes') ?? undefined);

  const wantsProductUpdate = name !== undefined || description !== undefined;
  const wantsVariantUpdate =
    formData.get('sku') != null ||
    formData.get('is_active') != null ||
    formData.get('unit_value') != null ||
    formData.get('unit_type') != null ||
    formData.get('package_type') != null ||
    formData.get('uom') != null;

  if ((wantsProductUpdate || wantsVariantUpdate) && !globalWrite) {
    if (!effectiveUnit) {
      return { error: 'Cannot rename or edit global catalog items without masters.write.global' };
    }
    revalidateMasters();
    return { ok: true };
  }

  if (!globalWrite) {
    revalidateMasters();
    return { ok: true };
  }

  const productUpdate: ProductUpdate = {};
  if (name !== undefined) productUpdate.name = name;
  if (description !== undefined) productUpdate.description = description;

  const productParsed = updateProductSchema.safeParse(productUpdate);
  if (!productParsed.success) {
    return { error: 'Invalid product input', details: productParsed.error.flatten() };
  }

  if (Object.keys(productUpdate).length > 0) {
    const { error: prodUpErr } = await supabase
      .from('products')
      .update(productUpdate)
      .eq('id', productRow.id);
    if (prodUpErr) return { error: prodUpErr.message };
  }

  const sku = formData.get('sku') !== null && formData.get('sku') !== undefined
    ? String(formData.get('sku'))
    : undefined;
  const is_active_val = formData.get('is_active');
  const is_active = is_active_val == null ? undefined : is_active_val === 'true';

  const uom = formString(formData, 'uom') ?? undefined;
  const variantUpdate: VariantUpdate = {};
  if (sku !== undefined) variantUpdate.sku = sku || null;
  if (is_active !== undefined) variantUpdate.is_active = is_active;

  if (formData.get('unit_value') !== undefined && formData.get('unit_value') !== null) {
    variantUpdate.unit_value = Number(formData.get('unit_value'));
  }
  if (formData.get('unit_type') !== undefined && formData.get('unit_type') !== null) {
    variantUpdate.unit_type = String(formData.get('unit_type')) as VariantUpdate['unit_type'];
  }
  if (formData.get('package_type') !== undefined && formData.get('package_type') !== null) {
    variantUpdate.package_type = String(formData.get('package_type')) as VariantUpdate['package_type'];
  }

  if (uom && variantUpdate.unit_type === undefined) {
    const mapped = mapUomToVariant(uom);
    variantUpdate.unit_value = mapped.unit_value;
    variantUpdate.unit_type = mapped.unit_type;
    variantUpdate.package_type = mapped.package_type;
  }

  const variantParsed = updateVariantSchema.safeParse(variantUpdate);
  if (!variantParsed.success) {
    return { error: 'Invalid variant input', details: variantParsed.error.flatten() };
  }

  if (Object.keys(variantUpdate).length > 0) {
    const { error: varUpErr } = await supabase
      .from('product_variants')
      .update(variantUpdate)
      .eq('id', variantRow.id);
    if (varUpErr) return { error: varUpErr.message };
  }

  revalidateMasters();
  return { ok: true };
}

export async function bulkImportMasterItemsAction(input: {
  category: Category;
  unit_id: string | null;
  rows: Array<Record<string, unknown>>;
}): Promise<{ ok?: boolean; result?: BulkImportResult; error?: string }> {
  const catParse = itemCategorySchema.safeParse(input.category);
  if (!catParse.success) return { error: 'Invalid category' };
  const category = catParse.data;

  const unitId = input.unit_id ?? null;
  const user = unitId
    ? await requireCapability('masters.write', unitId)
    : await requireCapability('masters.write.global', null);
  const globalWrite = canWriteGlobal(user);

  const supabase = await createClient();
  const result: BulkImportResult = {
    total: input.rows.length,
    inserted: 0,
    failed: 0,
    errors: [],
  };

  const categoryId = CATEGORY_ID_MAP[category] || '00000000-0000-0000-0000-000000000006';

  for (let i = 0; i < input.rows.length; i++) {
    const rowNumber = i + 1;
    const parsed = bulkImportRowSchema.safeParse(input.rows[i]);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      result.failed++;
      result.errors.push({
        rowNumber,
        name: String((input.rows[i] as { name?: string })?.name ?? ''),
        message: `${first.path.join('.')}: ${first.message}`,
      });
      continue;
    }
    const row: BulkImportRow = parsed.data;
    const variantShape: VariantShape = { ...mapUomToVariant(row.uom), sku: row.sku ?? null };

    let product = await findGlobalProduct(supabase, categoryId, row.name);
    if (!product) {
      if (!globalWrite) {
        result.failed++;
        result.errors.push({
          rowNumber,
          name: row.name,
          message: 'No global product with that name. Ops cannot create products.',
        });
        continue;
      }
      const created = await insertGlobalProduct(supabase, {
        category_id: categoryId,
        name: row.name,
        description: row.notes ?? null,
      });
      if ('error' in created) {
        result.failed++;
        result.errors.push({ rowNumber, name: row.name, message: created.error });
        continue;
      }
      product = created;
    }

    let variant = await findMatchingVariant(supabase, product.id, variantShape);
    if (!variant) {
      if (!globalWrite) {
        result.failed++;
        result.errors.push({
          rowNumber,
          name: row.name,
          message: 'No matching global variant. Ops cannot create variants.',
        });
        continue;
      }
      const created = await insertGlobalVariant(supabase, product.id, variantShape);
      if ('error' in created) {
        result.failed++;
        result.errors.push({ rowNumber, name: row.name, message: created.error });
        continue;
      }
      variant = created;
    }

    if (unitId) {
      const adopted = await upsertUnitCatalog(supabase, {
        unit_id: unitId,
        variant_id: variant.id,
        local_sku: row.sku ?? null,
      });
      if (adopted.error) {
        result.failed++;
        result.errors.push({ rowNumber, name: row.name, message: adopted.error });
        continue;
      }

      const rateWrite = await persistImportRate(supabase, {
        unitId,
        variantId: variant.id,
        category,
        row,
      });
      if (rateWrite.error) {
        result.failed++;
        result.errors.push({ rowNumber, name: row.name, message: rateWrite.error });
        continue;
      }
    }

    result.inserted++;
  }

  revalidateMasters();
  return { ok: true, result };
}

export type MasterPatch = {
  id: string;
  name?: string;
  sku?: string | null;
  local_sku?: string | null;
  uom?: 'kg' | 'g' | 'l' | 'ml' | 'piece' | 'pack' | 'bottle';
  is_active?: boolean;
  is_enabled?: boolean;
  rate?: number;
  effective_from?: string;
  ration_scale?: number | null;
  notes?: string;
};

export type BulkUpdateMastersResult = {
  attempted: number;
  updated: number;
  failed: number;
  errors: Array<{ id: string; message: string }>;
};

export async function bulkUpdateMasterItemsAction(input: {
  patches: MasterPatch[];
  unit_id?: string | null;
}): Promise<{ ok?: boolean; result?: BulkUpdateMastersResult; error?: string }> {
  const patches = (input?.patches ?? []).filter((p) => p && p.id);
  if (patches.length === 0) return { error: 'No changes to save' };
  if (patches.length > 500) return { error: 'Too many patches; split into batches of 500' };

  const unitId = input.unit_id ?? null;
  const user = unitId
    ? await requireCapability('masters.write', unitId)
    : await requireCapability('masters.write');
  const globalWrite = canWriteGlobal(user);
  const effectiveUnit = resolveActorUnit(user, unitId);

  const supabase = await createClient();

  const ids = Array.from(new Set(patches.map((p) => p.id)));
  const { data: existingVariants, error: lookupErr } = await supabase
    .from('product_variants')
    .select('id, product_id')
    .in('id', ids);
  if (lookupErr) return { error: lookupErr.message };
  if (!existingVariants || existingVariants.length === 0) return { error: 'No matching variants' };

  const productIds = Array.from(new Set(existingVariants.map((v) => v.product_id)));
  const { data: existingProducts, error: prodLookupErr } = await supabase
    .from('products')
    .select('id, category_id')
    .in('id', productIds);
  if (prodLookupErr) return { error: prodLookupErr.message };

  const productMap = new Map<string, { category_id: string }>();
  for (const p of existingProducts ?? []) {
    productMap.set(p.id, { category_id: p.category_id });
  }

  const byId = new Map<string, { product_id: string; category: Category }>();
  for (const v of existingVariants) {
    const p = productMap.get(v.product_id);
    if (!p) continue;
    let catSlug: Category = 'grocery';
    for (const [k, val] of Object.entries(CATEGORY_ID_MAP)) {
      if (val === p.category_id) {
        catSlug = k as Category;
        break;
      }
    }
    byId.set(v.id, { product_id: v.product_id, category: catSlug });
  }

  if (byId.size === 0) return { error: 'No matching items' };

  const result: BulkUpdateMastersResult = {
    attempted: patches.length,
    updated: 0,
    failed: 0,
    errors: [],
  };

  for (const patch of patches) {
    const row = byId.get(patch.id);
    if (!row) {
      result.failed++;
      result.errors.push({ id: patch.id, message: 'Item not found' });
      continue;
    }

    if (patch.name !== undefined) {
      if (!globalWrite) {
        result.failed++;
        result.errors.push({ id: patch.id, message: 'Cannot rename global products without masters.write.global' });
        continue;
      }
      const { error: prodErr } = await supabase
        .from('products')
        .update({ name: patch.name })
        .eq('id', row.product_id);
      if (prodErr) {
        result.failed++;
        result.errors.push({ id: patch.id, message: prodErr.message });
        continue;
      }
    }

    if (patch.notes !== undefined && globalWrite) {
      const { error: notesErr } = await supabase
        .from('products')
        .update({ description: patch.notes })
        .eq('id', row.product_id);
      if (notesErr) {
        result.failed++;
        result.errors.push({ id: patch.id, message: notesErr.message });
        continue;
      }
    }

    if (globalWrite) {
      const varPatch: VariantUpdate = {};
      if (patch.sku !== undefined && patch.local_sku === undefined) varPatch.sku = patch.sku;
      if (patch.is_active !== undefined && patch.is_enabled === undefined) {
        varPatch.is_active = patch.is_active;
      }
      if (patch.uom !== undefined) {
        const mapped = mapUomToVariant(patch.uom);
        varPatch.unit_value = mapped.unit_value;
        varPatch.unit_type = mapped.unit_type;
        varPatch.package_type = mapped.package_type;
      }
      if (Object.keys(varPatch).length > 0) {
        const { error: varErr } = await supabase
          .from('product_variants')
          .update(varPatch)
          .eq('id', patch.id);
        if (varErr) {
          result.failed++;
          result.errors.push({ id: patch.id, message: varErr.message });
          continue;
        }
      }
    } else if (patch.uom !== undefined) {
      result.failed++;
      result.errors.push({ id: patch.id, message: 'Cannot change global variant UOM without masters.write.global' });
      continue;
    }

    if (effectiveUnit) {
      const localSku = patch.local_sku !== undefined ? patch.local_sku : patch.sku;
      const isEnabled = patch.is_enabled !== undefined ? patch.is_enabled : patch.is_active;
      if (localSku !== undefined || isEnabled !== undefined) {
        const catalogPatch: { local_sku?: string | null; is_enabled?: boolean } = {};
        if (localSku !== undefined) catalogPatch.local_sku = localSku;
        if (isEnabled !== undefined) catalogPatch.is_enabled = isEnabled;
        const { data: existing } = await supabase
          .from('unit_catalog')
          .select('id')
          .eq('unit_id', effectiveUnit)
          .eq('variant_id', patch.id)
          .maybeSingle();
        if (existing) {
          const { error: catErr } = await supabase
            .from('unit_catalog')
            .update(catalogPatch)
            .eq('id', existing.id);
          if (catErr) {
            result.failed++;
            result.errors.push({ id: patch.id, message: catErr.message });
            continue;
          }
        } else {
          const adopted = await upsertUnitCatalog(supabase, {
            unit_id: effectiveUnit,
            variant_id: patch.id,
            ...catalogPatch,
          });
          if (adopted.error) {
            result.failed++;
            result.errors.push({ id: patch.id, message: adopted.error });
            continue;
          }
        }
      }

      if (patch.rate !== undefined) {
        const rateResult = await setUnitMenuRateAction({
          unit_id: effectiveUnit,
          variant_id: patch.id,
          rate: patch.rate,
          effective_from: patch.effective_from ?? todayIsoDate(),
        });
        if (rateResult.error) {
          result.failed++;
          result.errors.push({ id: patch.id, message: rateResult.error });
          continue;
        }
      }
    }

    result.updated++;
  }

  if (result.updated > 0) revalidateMasters();
  return { ok: true, result };
}

export async function deactivateMasterItemAction(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const id = formString(formData, 'id');
  if (!id) return { error: 'Missing id' };

  const unit_id = formString(formData, 'unit_id');
  if (unit_id) {
    await requireCapability('masters.write', unit_id);
    return unadoptVariantAction({ unit_id, variant_id: id, hard: false });
  }

  const user = await requireCapability('masters.write');
  const effectiveUnit = resolveActorUnit(user, null);
  if (!canWriteGlobal(user) && effectiveUnit) {
    return unadoptVariantAction({ unit_id: effectiveUnit, variant_id: id, hard: false });
  }

  if (!canWriteGlobal(user)) {
    return { error: 'Cannot deactivate a global variant without masters.write.global' };
  }

  await requireCapability('masters.write.global', null);

  const supabase = await createClient();
  const { error } = await supabase.from('product_variants').update({ is_active: false }).eq('id', id);
  if (error) return { error: error.message };

  revalidateMasters();
  return { ok: true };
}
