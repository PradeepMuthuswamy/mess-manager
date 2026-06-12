'use server';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireCapability } from '@/lib/auth/require-capability';
import { requireUser } from '@/lib/auth/require-role';
import {
  createProductSchema,
  updateProductSchema,
  createVariantSchema,
  updateVariantSchema,
  itemCategorySchema,
} from '@/lib/schemas/items';
import { bulkImportRowSchema, type BulkImportRow } from './bulk-import';
import type { Category } from './categories';

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
}

const CATEGORY_ID_MAP: Record<string, string> = {
  alcohol: '00000000-0000-0000-0000-000000000001',
  soft_drink: '00000000-0000-0000-0000-000000000002',
  cigar: '00000000-0000-0000-0000-000000000003',
  ration: '00000000-0000-0000-0000-000000000005',
  grocery: '00000000-0000-0000-0000-000000000006',
};

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

export async function createMasterItemAction(_prev: unknown, formData: FormData) {
  const unit_id = formData.get('unit_id') ? String(formData.get('unit_id')) : null;
  const categoryRaw = formData.get('category') ? String(formData.get('category')) : '';
  const category_id = CATEGORY_ID_MAP[categoryRaw] || String(formData.get('category_id') ?? '');
  const name = String(formData.get('name') ?? '');
  const description = formData.get('notes') ? String(formData.get('notes')) : (formData.get('description') ? String(formData.get('description')) : null);

  const productParsed = createProductSchema.safeParse({
    unit_id,
    category_id,
    name,
    description,
  });

  const uom = formData.get('uom') ? String(formData.get('uom')) : undefined;
  let variantData;
  if (uom && !formData.get('unit_type')) {
    variantData = mapUomToVariant(uom);
  } else {
    variantData = {
      unit_value: Number(formData.get('unit_value') ?? 1.0),
      unit_type: String(formData.get('unit_type') ?? 'PIECE') as any,
      package_type: String(formData.get('package_type') ?? 'LOOSE') as any,
    };
  }

  const variantParsed = createVariantSchema.safeParse({
    unit_value: variantData.unit_value,
    unit_type: variantData.unit_type,
    package_type: variantData.package_type,
    sku: formData.get('sku') || undefined,
  });

  if (!productParsed.success) {
    return { error: 'Invalid product input', details: productParsed.error.flatten() };
  }
  if (!variantParsed.success) {
    return { error: 'Invalid variant input', details: variantParsed.error.flatten() };
  }

  const cap = productParsed.data.unit_id ? 'masters.write' : 'masters.write.global';
  await requireCapability(cap, productParsed.data.unit_id ?? null);

  const supabase = await createClient();
  const { data: productRow, error: prodErr } = await supabase
    .from('products')
    .insert({
      unit_id: productParsed.data.unit_id ?? null,
      category_id: productParsed.data.category_id,
      name: productParsed.data.name,
      description: productParsed.data.description ?? null,
    })
    .select('id')
    .single();

  if (prodErr || !productRow) {
    return { error: prodErr?.message ?? 'Could not create product' };
  }

  const { data: variantRow, error: varErr } = await supabase
    .from('product_variants')
    .insert({
      product_id: productRow.id,
      unit_value: variantParsed.data.unit_value,
      unit_type: variantParsed.data.unit_type,
      package_type: variantParsed.data.package_type,
      sku: variantParsed.data.sku ?? null,
    })
    .select('id')
    .single();

  if (varErr || !variantRow) {
    await supabase.from('products').delete().eq('id', productRow.id);
    return { error: varErr?.message ?? 'Could not create variant' };
  }

  revalidateMasters();
  return { ok: true, id: variantRow.id };
}

export async function updateMasterItemAction(_prev: unknown, formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Missing id' };

  const supabase = await createClient();
  const { data: variantRow } = await supabase
    .from('product_variants')
    .select('id, product_id')
    .eq('id', id)
    .single();
  if (!variantRow) return { error: 'Variant not found' };

  const { data: productRow } = await supabase
    .from('products')
    .select('id, unit_id, category_id')
    .eq('id', variantRow.product_id)
    .single();
  if (!productRow) return { error: 'Product not found' };

  const cap = productRow.unit_id ? 'masters.write' : 'masters.write.global';
  await requireCapability(cap, productRow.unit_id ?? null);

  const name = formData.get('name') ? String(formData.get('name')) : undefined;
  const description = formData.get('description') !== null && formData.get('description') !== undefined
    ? String(formData.get('description'))
    : (formData.get('notes') ? String(formData.get('notes')) : undefined);

  const productUpdate: Record<string, any> = {};
  if (name !== undefined) productUpdate.name = name;
  if (description !== undefined) productUpdate.description = description;

  const productParsed = updateProductSchema.safeParse(productUpdate);
  if (!productParsed.success) {
    return { error: 'Invalid product input', details: productParsed.error.flatten() };
  }

  const scopeControl = formData.get('scope_control') === '1';
  const rawUnit = formData.get('unit_id');
  const desiredUnitId: string | null | undefined = scopeControl
    ? rawUnit
      ? String(rawUnit)
      : null
    : undefined;

  if (desiredUnitId !== undefined && desiredUnitId !== productRow.unit_id) {
    await requireCapability('masters.write.global', null);
    productUpdate.unit_id = desiredUnitId;
  }

  if (Object.keys(productUpdate).length > 0) {
    const { error: prodUpErr } = await supabase
      .from('products')
      .update(productUpdate as any)
      .eq('id', productRow.id);
    if (prodUpErr) return { error: prodUpErr.message };
  }

  const sku = formData.get('sku') !== null && formData.get('sku') !== undefined
    ? String(formData.get('sku'))
    : undefined;
  const is_active_val = formData.get('is_active');
  const is_active = is_active_val == null ? undefined : is_active_val === 'true';

  const uom = formData.get('uom') ? String(formData.get('uom')) : undefined;
  const variantUpdate: Record<string, any> = {};
  if (sku !== undefined) variantUpdate.sku = sku || null;
  if (is_active !== undefined) variantUpdate.is_active = is_active;

  if (formData.get('unit_value') !== undefined && formData.get('unit_value') !== null) {
    variantUpdate.unit_value = Number(formData.get('unit_value'));
  }
  if (formData.get('unit_type') !== undefined && formData.get('unit_type') !== null) {
    variantUpdate.unit_type = String(formData.get('unit_type'));
  }
  if (formData.get('package_type') !== undefined && formData.get('package_type') !== null) {
    variantUpdate.package_type = String(formData.get('package_type'));
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
      .update(variantUpdate as any)
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
  const cap = unitId ? 'masters.write' : 'masters.write.global';
  await requireCapability(cap, unitId);

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

    const { data: productRow, error: prodErr } = await supabase
      .from('products')
      .insert({
        unit_id: unitId,
        category_id: categoryId,
        name: row.name,
        description: row.notes ?? null,
      })
      .select('id')
      .single();

    if (prodErr || !productRow) {
      result.failed++;
      result.errors.push({
        rowNumber,
        name: row.name,
        message: prodErr?.message ?? 'Product insert failed',
      });
      continue;
    }

    const variantData = mapUomToVariant(row.uom);
    const { data: variantRow, error: varErr } = await supabase
      .from('product_variants')
      .insert({
        product_id: productRow.id,
        unit_value: variantData.unit_value,
        unit_type: variantData.unit_type,
        package_type: variantData.package_type,
        sku: row.sku ?? null,
      })
      .select('id')
      .single();

    if (varErr || !variantRow) {
      await supabase.from('products').delete().eq('id', productRow.id);
      result.failed++;
      result.errors.push({
        rowNumber,
        name: row.name,
        message: varErr?.message ?? 'Variant insert failed',
      });
      continue;
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
  uom?: 'kg' | 'g' | 'l' | 'ml' | 'piece' | 'pack' | 'bottle';
  is_active?: boolean;
  rate?: number;
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
}): Promise<{ ok?: boolean; result?: BulkUpdateMastersResult; error?: string }> {
  await requireUser();

  const patches = (input?.patches ?? []).filter((p) => p && p.id);
  if (patches.length === 0) return { error: 'No changes to save' };
  if (patches.length > 500) return { error: 'Too many patches; split into batches of 500' };

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
    .select('id, unit_id, category_id')
    .in('id', productIds);
  if (prodLookupErr) return { error: prodLookupErr.message };

  const productMap = new Map<string, { unit_id: string | null; category_id: string }>();
  for (const p of existingProducts ?? []) {
    productMap.set(p.id, { unit_id: p.unit_id, category_id: p.category_id });
  }

  const byId = new Map<string, { product_id: string; unit_id: string | null; category: Category }>();
  for (const v of existingVariants) {
    const p = productMap.get(v.product_id);
    if (p) {
      let catSlug: Category = 'grocery';
      for (const [k, val] of Object.entries(CATEGORY_ID_MAP)) {
        if (val === p.category_id) {
          catSlug = k as Category;
          break;
        }
      }
      byId.set(v.id, { product_id: v.product_id, unit_id: p.unit_id, category: catSlug });
    }
  }

  if (byId.size === 0) return { error: 'No matching items' };

  const unitsTouched = new Set<string | null>();
  for (const p of patches) {
    const row = byId.get(p.id);
    if (row) unitsTouched.add(row.unit_id);
  }
  for (const unitId of unitsTouched) {
    const cap = unitId ? 'masters.write' : 'masters.write.global';
    await requireCapability(cap, unitId ?? null);
  }

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
      const { data: variant } = await supabase
        .from('product_variants')
        .select('product_id')
        .eq('id', patch.id)
        .single();
      if (variant) {
        const { error: prodErr } = await supabase
          .from('products')
          .update({ name: patch.name } as any)
          .eq('id', variant.product_id);
        if (prodErr) {
          result.failed++;
          result.errors.push({ id: patch.id, message: prodErr.message });
          continue;
        }
      } else {
        result.failed++;
        result.errors.push({ id: patch.id, message: 'Variant not found' });
        continue;
      }
    }

    const varPatch: Record<string, any> = {};
    if (patch.sku !== undefined) varPatch.sku = patch.sku;
    if (patch.is_active !== undefined) varPatch.is_active = patch.is_active;
    if (patch.uom !== undefined) {
      const mapped = mapUomToVariant(patch.uom);
      varPatch.unit_value = mapped.unit_value;
      varPatch.unit_type = mapped.unit_type;
      varPatch.package_type = mapped.package_type;
    }

    if (Object.keys(varPatch).length > 0) {
      const { error: varErr } = await supabase
        .from('product_variants')
        .update(varPatch as any)
        .eq('id', patch.id);
      if (varErr) {
        result.failed++;
        result.errors.push({ id: patch.id, message: varErr.message });
        continue;
      }
    }

    result.updated++;
  }

  if (result.updated > 0) revalidateMasters();
  return { ok: true, result };
}

export async function deactivateMasterItemAction(_prev: unknown, formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Missing id' };

  const supabase = await createClient();
  const { data: variantRow } = await supabase
    .from('product_variants')
    .select('product_id')
    .eq('id', id)
    .single();
  if (!variantRow) return { error: 'Item not found' };

  const { data: productRow } = await supabase
    .from('products')
    .select('unit_id')
    .eq('id', variantRow.product_id)
    .single();
  if (!productRow) return { error: 'Item not found' };

  const cap = productRow.unit_id ? 'masters.write' : 'masters.write.global';
  await requireCapability(cap, productRow.unit_id ?? null);

  const { error } = await supabase.from('product_variants').update({ is_active: false }).eq('id', id);
  if (error) return { error: error.message };

  revalidateMasters();
  return { ok: true };
}
