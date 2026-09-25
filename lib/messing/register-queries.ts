import 'server-only';

import { getDb } from '@/lib/mongo';
import type { MessDailyExpenditureRow } from './types';

function cleanDoc<T>(doc: Record<string, unknown> | null | undefined): T {
  if (!doc) return doc as unknown as T;
  const { _id, ...rest } = doc;
  return rest as unknown as T;
}

/**
 * Today's (or any date's) daily messing register row, or null if kitchen has not logged.
 */
export async function getRegisterForDate(
  unitId: string,
  date: string
): Promise<MessDailyExpenditureRow | null> {
  const db = await getDb();
  const doc = await db.collection('mess_daily_expenditures').findOne({
    unit_id: unitId,
    expenditure_date: date,
  });
  return cleanDoc<MessDailyExpenditureRow | null>(doc);
}


/**
 * Registers awaiting Food Member approval (P3-APP-02).
 */
export async function listPendingRegisters(unitId: string): Promise<MessDailyExpenditureRow[]> {
  const db = await getDb();
  const docs = await db
    .collection('mess_daily_expenditures')
    .find({
      unit_id: unitId,
      register_status: 'submitted',
    })
    .sort({ expenditure_date: -1 })
    .toArray();
  return docs.map((d) => cleanDoc<MessDailyExpenditureRow>(d));
}
