import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { MessingMealType } from '@/lib/schemas/messing';
import { messingMealTypeEnum } from '@/lib/schemas/messing';

/**
 * Returns all flat rate records (past and current) sorted by valid_from desc, then meal_type asc.
 */
export async function getFlatRatesHistory(unitId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('messing_flat_rates')
    .select('*')
    .eq('unit_id', unitId)
    .order('valid_from', { ascending: false })
    .order('meal_type', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

/**
 * Returns a key-value mapping of active rates for all meal types on a given date (defaulting to 0 if not found).
 */
export async function getActiveFlatRates(
  unitId: string,
  dateStr: string
): Promise<Record<MessingMealType, number>> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('messing_flat_rates')
    .select('meal_type, rate')
    .eq('unit_id', unitId)
    .lte('valid_from', dateStr)
    .or(`valid_to.is.null,valid_to.gte.${dateStr}`);

  if (error) {
    throw new Error(error.message);
  }

  const mapping = {} as Record<MessingMealType, number>;
  for (const m of messingMealTypeEnum) {
    mapping[m] = 0;
  }

  if (data) {
    for (const row of data) {
      mapping[row.meal_type as MessingMealType] = Number(row.rate);
    }
  }

  return mapping;
}
