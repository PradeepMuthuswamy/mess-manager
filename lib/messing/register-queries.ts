import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { MessDailyExpenditureRow } from './types';

/**
 * Today's (or any date's) daily messing register row, or null if kitchen has not logged.
 */
export async function getRegisterForDate(
  unitId: string,
  date: string
): Promise<MessDailyExpenditureRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_daily_expenditures')
    .select('*')
    .eq('unit_id', unitId)
    .eq('expenditure_date', date)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Recent daily registers for the unit, newest date first.
 */
export async function listRecentRegisters(
  unitId: string,
  limit = 14
): Promise<MessDailyExpenditureRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_daily_expenditures')
    .select('*')
    .eq('unit_id', unitId)
    .order('expenditure_date', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Registers awaiting Food Member approval (P3-APP-02).
 */
export async function listPendingRegisters(unitId: string): Promise<MessDailyExpenditureRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mess_daily_expenditures')
    .select('*')
    .eq('unit_id', unitId)
    .eq('register_status', 'submitted')
    .order('expenditure_date', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}
