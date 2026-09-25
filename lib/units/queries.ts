import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/mongo';
import { ACTIVE_UNIT_COOKIE } from '@/lib/auth/types';
import type { Unit, UnitDoc, UnitRow, UnitSwitcherOption, UnitWithUserCount } from './types';
import type { Filter } from 'mongodb';

function formatUnit(doc: UnitDoc | Record<string, unknown>): Unit {
  const raw = doc as UnitDoc;
  const { _id, ...rest } = raw;
  return {
    ...rest,
    id: String(rest.id || _id?.toString() || ''),
    name: rest.name ?? '',
    code: rest.code ?? '',
    slug:
      rest.slug ??
      (rest.name
        ? rest.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
        : ''),
    mess_type: rest.mess_type ?? '',
    terrain_type: rest.terrain_type ?? rest.terrain ?? '',
    catering_type: rest.catering_type ?? 'unit',
    settings: (rest.settings as Record<string, unknown>) ?? {},
    check_in_tariff: rest.check_in_tariff ?? null,
    is_active: rest.is_active ?? true,
    created_at: rest.created_at ?? new Date().toISOString(),
    updated_at: rest.updated_at ?? new Date().toISOString(),
    description: rest.description ?? null,
    terrain: rest.terrain ?? rest.terrain_type ?? null,
    enabled_modules: rest.enabled_modules ?? null,
    bill_format_template: rest.bill_format_template ?? null,
    room_bill_format_template: rest.room_bill_format_template ?? null,
  };
}

/**
 * List units from the MongoDB units collection with optional filtering.
 */
export const listUnits = cache(
  async (options?: { activeOnly?: boolean; search?: string }): Promise<Unit[]> => {
    const db = await getDb();
    const query: Filter<unknown> = {};

    if (options?.activeOnly) {
      query.is_active = true;
    }

    if (options?.search) {
      const q = options.search.trim();
      query.$or = [
        { name: { $regex: q, $options: 'i' } },
        { code: { $regex: q, $options: 'i' } },
        { slug: { $regex: q, $options: 'i' } },
      ];
    }

    const units = await db
      .collection('units')
      .find(query)
      .sort({ name: 1 })
      .toArray();

    return units.map(formatUnit);
  },
);

/**
 * Get a single unit by ID from the MongoDB units collection.
 */
export const getUnitById = cache(async (id: string): Promise<Unit | null> => {
  if (!id) return null;
  const db = await getDb();
  const unit = await db.collection('units').findOne({ id });
  return unit ? formatUnit(unit) : null;
});

/**
 * Retrieve the currently active unit using the active unit cookie and MongoDB.
 */
export const getActiveUnit = cache(async (): Promise<Unit | null> => {
  const cookieStore = await cookies();
  const activeUnitId = cookieStore.get(ACTIVE_UNIT_COOKIE)?.value;
  if (!activeUnitId || activeUnitId === 'all') {
    return null;
  }
  return getUnitById(activeUnitId);
});

/** Active units for the navbar switcher — cached per request. */
export const listActiveUnitsForSwitcher = cache(
  async (): Promise<UnitSwitcherOption[]> => {
    const units = await listUnits({ activeOnly: true });
    return units.map((u) => ({
      id: u.id,
      name: u.name,
      code: u.code,
    }));
  },
);

/** Full unit roster for the platform units page. */
export const listAllUnits = cache(async (): Promise<UnitRow[]> => {
  return listUnits({ activeOnly: false });
});

/** Profile counts keyed by unit_id (users with no unit are omitted). */
export const countUsersByUnit = cache(async (): Promise<Map<string, number>> => {
  const db = await getDb();
  const profiles = await db
    .collection('profiles')
    .find({ unit_id: { $ne: null } }, { projection: { unit_id: 1, _id: 0 } })
    .toArray();

  const counts = new Map<string, number>();
  for (const row of profiles) {
    if (!row.unit_id) continue;
    counts.set(row.unit_id, (counts.get(row.unit_id) ?? 0) + 1);
  }
  return counts;
});

/** Units list with per-unit user counts for the platform table. */
export const listAllUnitsWithUserCounts = cache(
  async (): Promise<UnitWithUserCount[]> => {
    const [units, counts] = await Promise.all([listAllUnits(), countUsersByUnit()]);
    return units.map((unit) => ({
      ...unit,
      user_count: counts.get(unit.id) ?? 0,
    }));
  },
);

export const getUserCountForUnit = cache(async (unitId: string): Promise<number> => {
  if (!unitId) return 0;
  const db = await getDb();
  return db.collection('profiles').countDocuments({ unit_id: unitId });
});
