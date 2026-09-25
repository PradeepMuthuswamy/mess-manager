import 'server-only';

import { getDb } from '@/lib/mongo';
import { writeAudit } from '@/lib/audit/write-audit';
import { getAttendanceDay } from '@/lib/attendance/queries';
import { calculateDailyPRate } from '@/lib/billing/compute';
import type { MessDailyExpenditure, MessDailyPRate } from './types';

export async function recalculateDailyPRate(
  unitId: string,
  rateDate: string,
  calculatedBy: string,
): Promise<{ presentCount: number; ratePerDiner: number } | { error: string }> {
  const db = await getDb();

  const exp = await db.collection<MessDailyExpenditure>('mess_daily_expenditures').findOne({
    unit_id: unitId,
    expenditure_date: rateDate,
  });

  if (!exp) return { presentCount: 0, ratePerDiner: 0 };

  let presentCount = 0;
  try {
    const attendance = await getAttendanceDay(unitId, rateDate);
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

  const roundedRate = Math.round(ratePerDiner * 10000) / 10000;
  const now = new Date().toISOString();

  const existingPRate = await db.collection<MessDailyPRate>('mess_daily_p_rates').findOne({
    unit_id: unitId,
    rate_date: rateDate,
  });

  if (existingPRate) {
    const patch = {
      total_expenditure: Number(exp.total_amount),
      present_count: presentCount,
      rate_per_diner: roundedRate,
      calculated_at: now,
      calculated_by: calculatedBy,
    };
    await db.collection<MessDailyPRate>('mess_daily_p_rates').updateOne(
      { id: existingPRate.id },
      { $set: patch }
    );
    await writeAudit({
      table_name: 'mess_daily_p_rates',
      row_pk: existingPRate.id,
      op: 'UPDATE',
      active_unit_id: unitId,
      changed_by: calculatedBy,
      old_data: { rate_per_diner: existingPRate.rate_per_diner, present_count: existingPRate.present_count },
      new_data: patch,
    });
  } else {
    const newId = crypto.randomUUID();
    const doc: MessDailyPRate = {
      id: newId,
      unit_id: unitId,
      rate_date: rateDate,
      total_expenditure: Number(exp.total_amount),
      present_count: presentCount,
      rate_per_diner: roundedRate,
      calculated_at: now,
      calculated_by: calculatedBy,
    };
    await db.collection<MessDailyPRate>('mess_daily_p_rates').insertOne(doc);
    await writeAudit({
      table_name: 'mess_daily_p_rates',
      row_pk: newId,
      op: 'INSERT',
      active_unit_id: unitId,
      changed_by: calculatedBy,
      new_data: doc as unknown as Record<string, unknown>,
    });
  }

  return { presentCount, ratePerDiner };
}
