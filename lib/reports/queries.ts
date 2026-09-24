import 'server-only';

import { getCollection } from '@/lib/mongo';
import type { PRatePoint, UnitReportSnapshot } from './types';

const SETTLED_ROOM_STATUSES = ['paid', 'transferred_to_mess_bill'] as const;
const OPEN_MESS_BILL_STATUSES = ['published', 'overdue'] as const;

function isoDatePrefix(value: string | null | undefined): string | null {
  if (!value || value.length < 10) return null;
  return value.slice(0, 10);
}

function inInclusiveRange(date: string | null, start: string, end: string): boolean {
  return date != null && date >= start && date <= end;
}

export async function getUnitReport(
  unitId: string,
  start: string,
  end: string,
): Promise<UnitReportSnapshot> {
  const [pRatesCol, barCol, roomsCol, billsCol, rationCol] = await Promise.all([
    getCollection('mess_daily_p_rates'),
    getCollection('bar_chits'),
    getCollection('room_bills'),
    getCollection('mess_bills'),
    getCollection('ration_stock_transactions'),
  ]);

  const [pRatesDocs, barDocs, roomsDocs, billsDocs, rationDocs] = await Promise.all([
    pRatesCol
      .find({
        unit_id: unitId,
        rate_date: { $gte: start, $lte: end },
      })
      .sort({ rate_date: 1 })
      .toArray(),
    barCol
      .find({
        unit_id: unitId,
        status: 'finalized',
        booking_id: null,
        date: { $gte: start, $lte: end },
      })
      .toArray(),
    roomsCol
      .find({
        unit_id: unitId,
        $or: [
          { payment_status: { $in: ['paid', 'transferred_to_mess_bill'] } },
          { status: { $in: ['paid', 'transferred_to_mess_bill'] } },
        ],
      })
      .toArray(),
    billsCol
      .find({
        unit_id: unitId,
        status: { $in: [...OPEN_MESS_BILL_STATUSES] },
      })
      .toArray(),
    rationCol
      .find({
        unit_id: unitId,
        transaction_date: { $lte: end },
      })
      .toArray(),
  ]);

  const pRates: PRatePoint[] = pRatesDocs.map((row: Record<string, unknown>) => ({
    date: String(row.rate_date),
    rate: Number(row.rate_per_diner),
  }));

  const barSalesTotal = barDocs.reduce(
    (sum: number, row: unknown) => sum + Number(row.total_amount ?? 0),
    0,
  );

  const settled = new Set<string>(SETTLED_ROOM_STATUSES);
  const guestRoomRevenue = roomsDocs.reduce((sum: number, row: unknown) => {
    if (!settled.has(row.payment_status) && !settled.has(row.status)) return sum;
    const settledOn = isoDatePrefix(row.paid_at) ?? isoDatePrefix(row.updated_at);
    if (!inInclusiveRange(settledOn, start, end)) return sum;
    return sum + Number(row.total_amount ?? 0);
  }, 0);

  // Issued − returned in the window, valued at each variant's last receipt rate
  // as of `end` (receipts before the window still set the rate).
  const lastRateByVariant = new Map<string, { rate: number; date: string; at: string }>();
  const netQtyByVariant = new Map<string, number>();
  for (const tx of rationDocs) {
    const qty = Number(tx.quantity ?? 0);
    const variantId = String(tx.variant_id);
    const txDate = String(tx.transaction_date);
    if (tx.type === 'receipt') {
      const rate = Number(tx.rate);
      if (!Number.isFinite(rate)) continue;
      const createdAt = tx.created_at ?? '';
      const prev = lastRateByVariant.get(variantId);
      const newer =
        !prev ||
        txDate > prev.date ||
        (txDate === prev.date && createdAt >= prev.at);
      if (newer) {
        lastRateByVariant.set(variantId, {
          rate,
          date: txDate,
          at: createdAt,
        });
      }
      continue;
    }
    if (!inInclusiveRange(txDate, start, end)) continue;
    const cur = netQtyByVariant.get(variantId) ?? 0;
    if (tx.type === 'consumption') netQtyByVariant.set(variantId, cur + qty);
    else if (tx.type === 'return_to_source') netQtyByVariant.set(variantId, cur - qty);
  }

  let rationNetQty = 0;
  let rationNetAmount = 0;
  for (const [variantId, netQty] of netQtyByVariant) {
    rationNetQty += netQty;
    rationNetAmount += netQty * (lastRateByVariant.get(variantId)?.rate ?? 0);
  }
  rationNetQty = Math.round(rationNetQty * 10000) / 10000;
  rationNetAmount = Math.round(rationNetAmount * 100) / 100;

  let outstandingDues = 0;
  let outstandingCount = 0;
  for (const row of billsDocs) {
    const remaining = Number(row.total_amount ?? 0) - Number(row.paid_amount ?? 0);
    if (remaining <= 0) continue;
    outstandingDues += remaining;
    outstandingCount += 1;
  }

  return {
    periodStart: start,
    periodEnd: end,
    pRates,
    barSalesTotal,
    rationNetQty,
    rationNetAmount,
    guestRoomRevenue,
    outstandingDues,
    outstandingCount,
  };
}
