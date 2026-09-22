import 'server-only';

import { createClient } from '@/lib/supabase/server';
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
  const supabase = await createClient();

  const [pRatesRes, barRes, roomsRes, billsRes, rationRes] = await Promise.all([
    supabase
      .from('mess_daily_p_rates')
      .select('rate_date, rate_per_diner')
      .eq('unit_id', unitId)
      .gte('rate_date', start)
      .lte('rate_date', end)
      .order('rate_date', { ascending: true }),
    supabase
      .from('bar_chits')
      .select('total_amount')
      .eq('unit_id', unitId)
      .eq('status', 'finalized')
      .is('booking_id', null)
      .gte('date', start)
      .lte('date', end),
    supabase
      .from('room_bills')
      .select('total_amount, paid_at, updated_at, payment_status, status')
      .eq('unit_id', unitId)
      .or(
        'payment_status.in.(paid,transferred_to_mess_bill),status.in.(paid,transferred_to_mess_bill)',
      ),
    supabase
      .from('mess_bills')
      .select('total_amount, paid_amount')
      .eq('unit_id', unitId)
      .in('status', [...OPEN_MESS_BILL_STATUSES]),
    supabase
      .from('ration_stock_transactions')
      .select('variant_id, type, quantity, rate, transaction_date, created_at')
      .eq('unit_id', unitId)
      .lte('transaction_date', end),
  ]);

  if (pRatesRes.error) throw new Error(pRatesRes.error.message);
  if (barRes.error) throw new Error(barRes.error.message);
  if (roomsRes.error) throw new Error(roomsRes.error.message);
  if (billsRes.error) throw new Error(billsRes.error.message);
  if (rationRes.error) throw new Error(rationRes.error.message);

  const pRates: PRatePoint[] = (pRatesRes.data ?? []).map((row) => ({
    date: row.rate_date,
    rate: Number(row.rate_per_diner),
  }));

  const barSalesTotal = (barRes.data ?? []).reduce(
    (sum, row) => sum + Number(row.total_amount),
    0,
  );

  const settled = new Set<string>(SETTLED_ROOM_STATUSES);
  const guestRoomRevenue = (roomsRes.data ?? []).reduce((sum, row) => {
    if (!settled.has(row.payment_status) && !settled.has(row.status)) return sum;
    const settledOn = isoDatePrefix(row.paid_at) ?? isoDatePrefix(row.updated_at);
    if (!inInclusiveRange(settledOn, start, end)) return sum;
    return sum + Number(row.total_amount);
  }, 0);

  // Issued − returned in the window, valued at each variant's last receipt rate
  // as of `end` (receipts before the window still set the rate).
  const lastRateByVariant = new Map<string, { rate: number; date: string; at: string }>();
  const netQtyByVariant = new Map<string, number>();
  for (const tx of rationRes.data ?? []) {
    const qty = Number(tx.quantity);
    if (tx.type === 'receipt') {
      const rate = Number(tx.rate);
      if (!Number.isFinite(rate)) continue;
      const createdAt = tx.created_at ?? '';
      const prev = lastRateByVariant.get(tx.variant_id);
      const newer =
        !prev ||
        tx.transaction_date > prev.date ||
        (tx.transaction_date === prev.date && createdAt >= prev.at);
      if (newer) {
        lastRateByVariant.set(tx.variant_id, {
          rate,
          date: tx.transaction_date,
          at: createdAt,
        });
      }
      continue;
    }
    if (!inInclusiveRange(tx.transaction_date, start, end)) continue;
    const cur = netQtyByVariant.get(tx.variant_id) ?? 0;
    if (tx.type === 'consumption') netQtyByVariant.set(tx.variant_id, cur + qty);
    else if (tx.type === 'return_to_source') netQtyByVariant.set(tx.variant_id, cur - qty);
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
  for (const row of billsRes.data ?? []) {
    const remaining = Number(row.total_amount) - Number(row.paid_amount);
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
