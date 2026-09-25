import 'server-only';
import { getDb } from '@/lib/mongo';

/**
 * Clone active master ration scales (unit_id: null, is_active: true)
 * into a newly onboarded unit in MongoDB.
 */
export async function cloneMasterRationScales(
  unitId: string,
  createdBy: string,
): Promise<void> {
  const db = await getDb();
  const rationScalesCol = db.collection('ration_scales');
  const versionsCol = db.collection('ration_scale_item_versions');

  // Find active master scales
  const masterScales = await rationScalesCol
    .find({
      $or: [{ unit_id: null }, { unit_id: { $exists: false } }],
      is_active: true,
    })
    .toArray();

  const now = new Date().toISOString();

  for (const master of masterScales) {
    // Check if unit already has this combo
    const exists = await rationScalesCol.findOne({
      unit_id: unitId,
      rank_class: master.rank_class,
      terrain: master.terrain,
    });
    if (exists) continue;

    const newScaleId = crypto.randomUUID();
    await rationScalesCol.insertOne({
      id: newScaleId,
      unit_id: unitId,
      name: master.name,
      rank_class: master.rank_class,
      terrain: master.terrain,
      description: master.description ?? null,
      is_active: true,
      created_by: createdBy,
      created_at: now,
      updated_at: now,
    });

    // Find master versions
    const masterVersions = await versionsCol
      .find({
        scale_id: master.id,
        $or: [{ valid_to: null }, { valid_to: { $exists: false } }],
      })
      .toArray();

    if (masterVersions.length > 0) {
      const newVersions = masterVersions.map((v) => ({
        id: crypto.randomUUID(),
        scale_id: newScaleId,
        variant_id: v.variant_id,
        auth_qty: v.auth_qty,
        uom: v.uom,
        notes: v.notes ?? null,
        valid_from: now,
        valid_to: null,
        created_by: createdBy,
        created_at: now,
      }));
      await versionsCol.insertMany(newVersions);
    }
  }
}

/**
 * Undo a failed onboard: delete child ration scales and their item versions,
 * then delete the unit itself.
 */
export async function rollbackNewUnit(
  unitId: string,
): Promise<{ error?: string }>;
export async function rollbackNewUnit(
  client: unknown,
  unitId: string,
): Promise<{ error?: string }>;
export async function rollbackNewUnit(
  unitIdOrClient: unknown,
  maybeUnitId?: string,
): Promise<{ error?: string }> {
  const unitId = typeof unitIdOrClient === 'string' ? unitIdOrClient : maybeUnitId;
  if (!unitId) return { error: 'Missing unit ID for rollback' };

  try {
    const db = await getDb();
    const rationScalesCol = db.collection('ration_scales');
    const versionsCol = db.collection('ration_scale_item_versions');
    const unitsCol = db.collection('units');

    // Find scales for this unit
    const scales = await rationScalesCol
      .find({ unit_id: unitId }, { projection: { id: 1 } })
      .toArray();
    const scaleIds = scales.map((s) => s.id).filter(Boolean);

    if (scaleIds.length > 0) {
      await versionsCol.deleteMany({ scale_id: { $in: scaleIds } });
      await rationScalesCol.deleteMany({ unit_id: unitId });
    }

    await unitsCol.deleteOne({ id: unitId });
    return {};
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || 'Failed to rollback unit' };
  }
}
