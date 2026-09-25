'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/mongo';
import { requireCapability, userHasCapability } from '@/lib/auth/require-capability';
import { directSetRationScaleItem } from '@/lib/ration/actions';
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

type ProductUpdate = {
  name?: string;
  name_normalized?: string;
  description?: string | null;
  updated_at?: string;
};

type VariantUpdate = {
  sku?: string | null;
  is_active?: boolean;
  unit_value?: number;
  unit_type?: 'ML' | 'LITRE' | 'GRAM' | 'KG' | 'PIECE';
  package_type?: 'BOTTLE' | 'CAN' | 'PACKET' | 'BOX' | 'LOOSE';
  updated_at?: string;
};

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
  categoryId: string,
  name: string,
): Promise<{ id: string } | null> {
  const db = await getDb();
  const data = await db.collection('products').findOne({
    category_id: categoryId,
    name_normalized: name.trim().toLowerCase(),
  });
  if (!data) return null;
  return { id: String(data.id || data._id) };
}

async function findMatchingVariant(
  productId: string,
  shape: VariantShape,
): Promise<{ id: string } | null> {
  const db = await getDb();
  if (shape.sku) {
    const bySku = await db.collection('product_variants').findOne({
      product_id: productId,
      sku: shape.sku,
    });
    if (bySku) return { id: String(bySku.id || bySku._id) };
  }

  const byIdentity = await db.collection('product_variants').findOne({
    product_id: productId,
    unit_value: shape.unit_value,
    unit_type: shape.unit_type,
    package_type: shape.package_type,
  });
  if (byIdentity) return { id: String(byIdentity.id || byIdentity._id) };

  const only = await db.collection('product_variants').find({ product_id: productId }).toArray();
  if (only?.length === 1) return { id: String(only[0].id || only[0]._id) };
  return null;
}

async function insertGlobalProduct(
  input: { category_id: string; name: string; description?: string | null },
): Promise<{ id: string } | { error: string }> {
  const db = await getDb();
  const nameNormalized = input.name.trim().toLowerCase();
  const existing = await db.collection('products').findOne({
    category_id: input.category_id,
    name_normalized: nameNormalized,
  });
  if (existing) {
    return { id: String(existing.id || existing._id) };
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  try {
    await db.collection('products').insertOne({
      id,
      category_id: input.category_id,
      name: input.name,
      name_normalized: nameNormalized,
      description: input.description ?? null,
      created_at: now,
      updated_at: now,
    });
    return { id };
  } catch (err: unknown) {
    const existingAfter = await findGlobalProduct(input.category_id, input.name);
    if (existingAfter) return existingAfter;
    return { error: err instanceof Error ? err.message : 'Could not create product' };
  }
}

async function insertGlobalVariant(
  productId: string,
  shape: VariantShape,
): Promise<{ id: string } | { error: string }> {
  const db = await getDb();
  const existing = await findMatchingVariant(productId, shape);
  if (existing) return existing;

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  try {
    await db.collection('product_variants').insertOne({
      id,
      product_id: productId,
      unit_value: shape.unit_value,
      unit_type: shape.unit_type,
      package_type: shape.package_type,
      sku: shape.sku ?? null,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
    return { id };
  } catch (err: unknown) {
    const existingAfter = await findMatchingVariant(productId, shape);
    if (existingAfter) return existingAfter;
    return { error: err instanceof Error ? err.message : 'Could not create variant' };
  }
}

async function upsertUnitCatalog(
  input: { unit_id: string; variant_id: string; local_sku?: string | null; is_enabled?: boolean },
): Promise<{ error?: string }> {
  try {
    const db = await getDb();
    const now = new Date().toISOString();
    await db.collection('unit_catalog').updateOne(
      { unit_id: input.unit_id, variant_id: input.variant_id },
      {
        $set: {
          is_enabled: input.is_enabled ?? true,
          local_sku: input.local_sku ?? null,
          updated_at: now,
        },
        $setOnInsert: {
          id: crypto.randomUUID(),
          unit_id: input.unit_id,
          variant_id: input.variant_id,
          created_at: now,
        },
      },
      { upsert: true },
    );
    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to update unit catalog' };
  }
}

async function persistImportRate(
  input: {
    unitId: string;
    variantId: string;
    category: Category;
    row: BulkImportRow;
    userId?: string;
  },
): Promise<{ error?: string }> {
  const db = await getDb();

  if (input.category === 'ration') {
    const scales = await db.collection('ration_scales').find({
      unit_id: input.unitId,
      is_active: true,
    }).toArray();

    if (!scales || scales.length === 0) {
      return { error: 'No active ration scale for this unit' };
    }

    const qty = input.row.ration_scale ?? input.row.rate;
    const effective = new Date().toISOString();
    for (const scale of scales) {
      try {
        await directSetRationScaleItem({
          scaleId: String(scale.id || scale._id),
          variantId: input.variantId,
          authQty: qty,
          uom: input.row.uom,
          notes: input.row.notes ?? undefined,
          effectiveAt: effective,
          userId: input.userId || 'system',
        });
      } catch (err: unknown) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    }
    return {};
  }

  if (!INVENTORY_RATE_CATEGORIES.has(input.category)) {
    return { error: `Cannot persist rate for category ${input.category}` };
  }

  const now = new Date().toISOString();
  await db.collection('unit_inventory').insertOne({
    id: crypto.randomUUID(),
    unit_id: input.unitId,
    variant_id: input.variantId,
    qty_packs: 0,
    rate: input.row.rate,
    acquired_on: todayIsoDate(),
    source: 'bulk_import',
    is_active: true,
    created_at: now,
    updated_at: now,
  });
  return {};
}

export async function createGlobalProductAction(input: unknown): Promise<ActionResult> {
  const parsed = createItemApiSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Invalid product input', details: parsed.error.flatten() };
  }

  await requireCapability('masters.write.global', null);

  const product = await insertGlobalProduct({
    category_id: parsed.data.category_id,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
  });
  if ('error' in product) return { error: product.error };

  const variant = await insertGlobalVariant(product.id, parsed.data.variant);
  if ('error' in variant) {
    const db = await getDb();
    await db.collection('products').deleteOne({ id: product.id });
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

  const db = await getDb();
  const variant = await db.collection('product_variants').findOne({ id: parsed.data.variant_id });
  if (!variant) return { error: 'Variant not found' };

  const adopted = await upsertUnitCatalog(parsed.data);
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

  const db = await getDb();
  if (parsed.data.hard) {
    await db.collection('unit_catalog').deleteOne({
      unit_id: parsed.data.unit_id,
      variant_id: parsed.data.variant_id,
    });
  } else {
    const res = await db.collection('unit_catalog').updateOne(
      { unit_id: parsed.data.unit_id, variant_id: parsed.data.variant_id },
      { $set: { is_enabled: false, updated_at: new Date().toISOString() } },
    );
    if (res.matchedCount === 0) return { error: 'Adoption not found' };
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

  const db = await getDb();
  const now = new Date().toISOString();
  await db.collection('unit_menu_rates').updateOne(
    {
      unit_id: parsed.data.unit_id,
      variant_id: parsed.data.variant_id,
      effective_from: parsed.data.effective_from,
    },
    {
      $set: {
        rate: parsed.data.rate,
        updated_at: now,
      },
      $setOnInsert: {
        id: crypto.randomUUID(),
        unit_id: parsed.data.unit_id,
        variant_id: parsed.data.variant_id,
        effective_from: parsed.data.effective_from,
        created_at: now,
      },
    },
    { upsert: true },
  );

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

      const product = await findGlobalProduct(category_id, name);
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

      const variant = await findMatchingVariant(product.id, shape);
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
        unit_type: String(formData.get('unit_type') ?? 'PIECE') as VariantShape['unit_type'],
        package_type: String(formData.get('package_type') ?? 'LOOSE') as VariantShape['package_type'],
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

  const db = await getDb();
  const variantRow = await db.collection('product_variants').findOne({ id });
  if (!variantRow) return { error: 'Variant not found' };

  const productRow = await db.collection('products').findOne({ id: variantRow.product_id });
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
      const adopted = await upsertUnitCatalog({
        unit_id: effectiveUnit,
        variant_id: variantRow.id,
        ...catalogPatch,
      });
      if (adopted.error) return { error: adopted.error };
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

  const now = new Date().toISOString();
  const productUpdate: ProductUpdate = {};
  if (name !== undefined) {
    productUpdate.name = name;
    productUpdate.name_normalized = name.trim().toLowerCase();
  }
  if (description !== undefined) productUpdate.description = description;

  const productParsed = updateProductSchema.safeParse(productUpdate);
  if (!productParsed.success) {
    return { error: 'Invalid product input', details: productParsed.error.flatten() };
  }

  if (Object.keys(productUpdate).length > 0) {
    productUpdate.updated_at = now;
    await db.collection('products').updateOne({ id: productRow.id }, { $set: productUpdate });
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
    variantUpdate.updated_at = now;
    await db.collection('product_variants').updateOne({ id: variantRow.id }, { $set: variantUpdate });
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

    let product = await findGlobalProduct(categoryId, row.name);
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
      const created = await insertGlobalProduct({
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

    let variant = await findMatchingVariant(product.id, variantShape);
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
      const created = await insertGlobalVariant(product.id, variantShape);
      if ('error' in created) {
        result.failed++;
        result.errors.push({ rowNumber, name: row.name, message: created.error });
        continue;
      }
      variant = created;
    }

    if (unitId) {
      const adopted = await upsertUnitCatalog({
        unit_id: unitId,
        variant_id: variant.id,
        local_sku: row.sku ?? null,
      });
      if (adopted.error) {
        result.failed++;
        result.errors.push({ rowNumber, name: row.name, message: adopted.error });
        continue;
      }

      const rateWrite = await persistImportRate({
        unitId,
        variantId: variant.id,
        category,
        row,
        userId: user.id,
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

  const db = await getDb();
  const ids = Array.from(new Set(patches.map((p) => p.id)));

  const existingVariants = await db
    .collection('product_variants')
    .find({ id: { $in: ids } })
    .toArray();
  if (!existingVariants || existingVariants.length === 0) return { error: 'No matching variants' };

  const productIds = Array.from(new Set(existingVariants.map((v) => v.product_id)));
  const existingProducts = await db
    .collection('products')
    .find({ id: { $in: productIds } })
    .toArray();

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

  const now = new Date().toISOString();

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
      try {
        await db.collection('products').updateOne(
          { id: row.product_id },
          {
            $set: {
              name: patch.name,
              name_normalized: patch.name.trim().toLowerCase(),
              updated_at: now,
            },
          },
        );
      } catch (prodErr: unknown) {
        result.failed++;
        result.errors.push({ id: patch.id, message: prodErr instanceof Error ? prodErr.message : String(prodErr) });
        continue;
      }
    }

    if (patch.notes !== undefined && globalWrite) {
      try {
        await db.collection('products').updateOne(
          { id: row.product_id },
          { $set: { description: patch.notes, updated_at: now } },
        );
      } catch (notesErr: unknown) {
        result.failed++;
        result.errors.push({ id: patch.id, message: notesErr instanceof Error ? notesErr.message : String(notesErr) });
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
        varPatch.updated_at = now;
        try {
          await db.collection('product_variants').updateOne(
            { id: patch.id },
            { $set: varPatch },
          );
        } catch (varErr: unknown) {
          result.failed++;
          result.errors.push({ id: patch.id, message: varErr instanceof Error ? varErr.message : String(varErr) });
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

        const adopted = await upsertUnitCatalog({
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

  const db = await getDb();
  await db.collection('product_variants').updateOne(
    { id },
    { $set: { is_active: false, updated_at: new Date().toISOString() } },
  );

  revalidateMasters();
  return { ok: true };
}
