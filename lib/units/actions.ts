'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/mongo';
import { requireRole } from '@/lib/auth/require-role';
import { writeAudit } from '@/lib/audit/write-audit';
import {
  UNIT_MODULE_IDS,
  createUnitSchema,
  updateUnitSchema,
  type UnitModuleId,
} from '@/lib/schemas/units';
import { rollbackNewUnit, cloneMasterRationScales } from '@/lib/units/onboard';
import type { Unit } from '@/lib/units/types';

export type UnitActionState = {
  ok?: true;
  error?: string;
  details?: unknown;
} | null;

function optionalText(value: FormDataEntryValue | null): string | undefined {
  const raw = String(value ?? '').trim();
  return raw ? raw : undefined;
}

/** Empty string clears a nullable column; omit only when the field is absent. */
function nullableText(value: FormDataEntryValue | null): string | null | undefined {
  if (value == null) return undefined;
  const raw = String(value).trim();
  return raw ? raw : null;
}

function parseModules(formData: FormData): UnitModuleId[] | undefined {
  const raw = formData
    .getAll('enabled_modules')
    .map(String)
    .filter((value): value is UnitModuleId =>
      (UNIT_MODULE_IDS as readonly string[]).includes(value as UnitModuleId),
    );
  return raw.length > 0 ? raw : undefined;
}

function revalidateUnits(unitId?: string) {
  revalidatePath('/units');
  if (unitId) revalidatePath(`/units/${unitId}`);
  revalidatePath('/admin');
  revalidatePath('/', 'layout');
}

export async function createUnitAction(
  _prev: unknown,
  formData: FormData,
): Promise<UnitActionState> {
  const user = await requireRole(['super_admin']);
  const parsed = createUnitSchema.safeParse({
    name: formData.get('name'),
    code: String(formData.get('code') ?? '').trim().toUpperCase(),
    description: nullableText(formData.get('description')),
    is_active: formData.get('is_active')
      ? formData.get('is_active') === 'true'
      : true,
    terrain: optionalText(formData.get('terrain')) ?? null,
    mess_type: optionalText(formData.get('mess_type')) ?? null,
    enabled_modules: parseModules(formData),
    bill_format_template: optionalText(formData.get('bill_format_template')),
    room_bill_format_template: optionalText(formData.get('room_bill_format_template')),
    admin_email: formData.get('admin_email'),
    admin_full_name: formData.get('admin_full_name'),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
      details: parsed.error.flatten(),
    };
  }

  // admin_email and admin_full_name stay on the schema. Accept-invite no longer
  // writes a credential that sign-in reads, so they are not stored.
  const { admin_email, admin_full_name, ...unitFields } = parsed.data;
  void admin_email;
  void admin_full_name;
  const db = await getDb();
  const unitsCol = db.collection('units');

  const nameTrimmed = unitFields.name.trim();
  const codeTrimmed = unitFields.code.toUpperCase().trim();

  // Check unique name / code
  const existing = await unitsCol.findOne({
    $or: [
      { code: codeTrimmed },
      { name: { $regex: `^${nameTrimmed}$`, $options: 'i' } },
    ],
  });

  if (existing) {
    return { error: 'A unit with that name or code already exists.' };
  }

  const now = new Date().toISOString();
  const unitId = crypto.randomUUID();
  const slug =
    nameTrimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || codeTrimmed.toLowerCase();

  const newUnitDoc: Unit = {
    id: unitId,
    name: nameTrimmed,
    code: codeTrimmed,
    slug,
    description: unitFields.description ?? null,
    is_active: unitFields.is_active ?? true,
    mess_type: unitFields.mess_type ?? '',
    terrain_type: unitFields.terrain ?? '',
    terrain: unitFields.terrain ?? null,
    catering_type: 'unit',
    settings: {},
    check_in_tariff: null,
    enabled_modules: unitFields.enabled_modules ?? [...UNIT_MODULE_IDS],
    bill_format_template: unitFields.bill_format_template ?? null,
    room_bill_format_template: unitFields.room_bill_format_template ?? null,
    created_by: user.id,
    updated_by: user.id,
    created_at: now,
    updated_at: now,
  };

  await unitsCol.insertOne(newUnitDoc);

  await writeAudit({
    table_name: 'units',
    row_pk: unitId,
    op: 'INSERT',
    changed_by: user.id,
    active_unit_id: unitId,
    new_data: newUnitDoc as Record<string, unknown>,
  });

  try {
    await cloneMasterRationScales(unitId, user.id);
  } catch (cloneErr: unknown) {
    const errMsg = cloneErr instanceof Error ? cloneErr.message : String(cloneErr);
    const rollback = await rollbackNewUnit(unitId);
    revalidateUnits(unitId);
    if (rollback.error) {
      return {
        error: `Unit created but ration scales could not be cloned, and cleanup failed: ${errMsg}`,
      };
    }
    return { error: `Could not finish onboarding: ${errMsg}` };
  }

  revalidateUnits(unitId);

  return { ok: true };
}

export async function updateUnitAction(
  _prev: unknown,
  formData: FormData,
): Promise<UnitActionState> {
  const user = await requireRole(['super_admin']);
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Missing id' };

  const parsed = updateUnitSchema.safeParse({
    name: optionalText(formData.get('name')),
    code: optionalText(formData.get('code'))?.toUpperCase(),
    description: nullableText(formData.get('description')),
    is_active:
      formData.get('is_active') == null
        ? undefined
        : formData.get('is_active') === 'true',
    terrain: optionalText(formData.get('terrain')) ?? null,
    mess_type: optionalText(formData.get('mess_type')) ?? null,
    enabled_modules: parseModules(formData),
    bill_format_template: optionalText(formData.get('bill_format_template')),
    room_bill_format_template: optionalText(formData.get('room_bill_format_template')),
  });

  if (!parsed.success) {
    return { error: 'Invalid input', details: parsed.error.flatten() };
  }

  const db = await getDb();
  const unitsCol = db.collection('units');
  const existing = await unitsCol.findOne({ id });
  if (!existing) return { error: 'Unit not found' };

  if (parsed.data.name || parsed.data.code) {
    const conflict = await unitsCol.findOne({
      id: { $ne: id },
      $or: [
        ...(parsed.data.code ? [{ code: parsed.data.code.toUpperCase() }] : []),
        ...(parsed.data.name
          ? [{ name: { $regex: `^${parsed.data.name.trim()}$`, $options: 'i' } }]
          : []),
      ],
    });
    if (conflict) {
      return { error: 'A unit with that name or code already exists.' };
    }
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    ...parsed.data,
    updated_by: user.id,
    updated_at: now,
  };

  if (parsed.data.name) {
    const codeVal =
      typeof updates.code === 'string'
        ? updates.code
        : typeof existing.code === 'string'
          ? existing.code
          : '';
    updates.slug =
      parsed.data.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || codeVal.toLowerCase();
  }
  if (parsed.data.terrain !== undefined) {
    updates.terrain_type = parsed.data.terrain ?? '';
  }

  await unitsCol.updateOne({ id }, { $set: updates });

  await writeAudit({
    table_name: 'units',
    row_pk: id,
    op: 'UPDATE',
    changed_by: user.id,
    active_unit_id: id,
    old_data: existing as Record<string, unknown>,
    new_data: { ...existing, ...updates } as Record<string, unknown>,
  });

  revalidateUnits(id);
  return { ok: true };
}

export async function setUnitActiveAction(
  formData: FormData,
): Promise<UnitActionState> {
  const user = await requireRole(['super_admin']);
  const id = String(formData.get('id') ?? '');
  const active = String(formData.get('is_active') ?? '') === 'true';
  if (!id) return { error: 'Missing id' };

  const db = await getDb();
  const unitsCol = db.collection('units');
  const existing = await unitsCol.findOne({ id });
  if (!existing) return { error: 'Unit not found' };

  const now = new Date().toISOString();
  await unitsCol.updateOne(
    { id },
    { $set: { is_active: active, updated_by: user.id, updated_at: now } },
  );

  await writeAudit({
    table_name: 'units',
    row_pk: id,
    op: 'UPDATE',
    changed_by: user.id,
    active_unit_id: id,
    diff: { is_active: active },
  });

  revalidateUnits(id);
  return { ok: true };
}

/** @deprecated use setUnitActiveAction */
export async function deactivateUnitAction(
  formData: FormData,
): Promise<UnitActionState> {
  formData.set('is_active', 'false');
  return setUnitActiveAction(formData);
}
