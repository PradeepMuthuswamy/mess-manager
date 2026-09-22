import 'server-only';
import { createClient } from '@/lib/supabase/server';

export const MODULE_IDS = [
  'attendance',
  'ration',
  'bar',
  'guest_rooms',
  'billing',
  'parties',
  'calendar',
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

const MODULE_ID_SET = new Set<string>(MODULE_IDS);

export function isModuleId(value: string): value is ModuleId {
  return MODULE_ID_SET.has(value);
}

export function defaultEnabledModules(): ModuleId[] {
  return [...MODULE_IDS];
}

type UnitEnabledModulesRow = {
  enabled_modules?: unknown;
};

/**
 * Enabled modules for a unit (REQ-PLAT-04 / REQ-DASH-02).
 * If `units.enabled_modules` is absent (column not yet in schema, null, or
 * non-array), every known module is treated as enabled.
 */
export async function getEnabledModules(unitId: string): Promise<ModuleId[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('units')
    .select('enabled_modules')
    .eq('id', unitId)
    .maybeSingle();

  if (error || !data) {
    return defaultEnabledModules();
  }

  const raw = (data as UnitEnabledModulesRow).enabled_modules;
  if (!Array.isArray(raw)) {
    return defaultEnabledModules();
  }

  const enabled = new Set(
    raw.filter((value): value is string => typeof value === 'string').filter(isModuleId),
  );
  return MODULE_IDS.filter((id) => enabled.has(id));
}
