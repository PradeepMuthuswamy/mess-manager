import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { getAttendanceDay } from '@/lib/attendance/queries';
import { calculateDailyPRate } from '@/lib/billing/compute';

export async function recalculateDailyPRate(
  unitId: string,
  rateDate: string,
  calculatedBy: string,
): Promise<{ presentCount: number; ratePerDiner: number } | { error: string }> {
  const supabase = await createClient();

  const { data: exp, error: expErr } = await supabase
    .from('mess_daily_expenditures')
    .select('morning_amount, afternoon_amount, dinner_amount, total_amount')
    .eq('unit_id', unitId)
    .eq('expenditure_date', rateDate)
    .maybeSingle();

  if (expErr) return { error: expErr.message };
  if (!exp) return { presentCount: 0, ratePerDiner: 0 };

  let presentCount = 0;
  try {
    const attendance = await getAttendanceDay(unitId, rateDate, supabase);
    if (attendance.status !== 'finalized') {
      return { presentCount: 0, ratePerDiner: 0 };
    }
    presentCount = attendance.present_count;
  } catch {
    presentCount = 0;
  }

  const ratePerDiner = calculateDailyPRate(
    Number(exp.morning_amount),
    Number(exp.afternoon_amount),
    Number(exp.dinner_amount),
    presentCount,
  );

  const { error } = await supabase.from('mess_daily_p_rates').upsert(
    {
      unit_id: unitId,
      rate_date: rateDate,
      total_expenditure: Number(exp.total_amount),
      present_count: presentCount,
      rate_per_diner: Math.round(ratePerDiner * 10000) / 10000,
      calculated_at: new Date().toISOString(),
      calculated_by: calculatedBy,
    },
    { onConflict: 'unit_id, rate_date' },
  );

  if (error) return { error: error.message };
  return { presentCount, ratePerDiner };
}
