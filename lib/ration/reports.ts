import 'server-only';

import { getCollection, getDb } from '@/lib/mongo';
import { getMonthlyAttendance } from '@/lib/attendance/queries';
import type { AttendanceStatus } from '@/lib/attendance/types';

export type RationMonthlyPresentDay = {
  date: string;
  present_count: number;
  status: AttendanceStatus;
};

export type RationMonthlyVariantRow = {
  variant_id: string;
  item_name: string;
  uom: string;
  quantity: number;
  days_posted: number;
};

export type RationMonthlyReport = {
  unit_id: string;
  month: string;
  start: string;
  end: string;
  recorded_days: number;
  finalized_days: number;
  total_present: number;
  average_present: number | null;
  days: RationMonthlyPresentDay[];
  variants: RationMonthlyVariantRow[];
};

function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${month}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export function parseReportMonth(value: string | undefined): string {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  return new Date().toISOString().slice(0, 7);
}

export async function getRationMonthlyReport(
  unitId: string,
  month: string,
): Promise<RationMonthlyReport> {
  const { start, end } = monthBounds(month);

  const attendance = await getMonthlyAttendance(unitId, month);

  const days = Object.values(attendance.days)
    .map((d) => ({
      date: d.date,
      present_count: d.present_count,
      status: d.status,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalPresent = days.reduce((sum, d) => sum + d.present_count, 0);
  const finalizedDays = days.filter((d) => d.status === 'finalized').length;

  const consCol = await getCollection('ration_consumptions');
  const consumptions = await consCol
    .find({
      unit_id: unitId,
      consumption_date: { $gte: start, $lte: end },
    })
    .toArray();

  const byVariant = new Map<
    string,
    { quantity: number; dates: Set<string> }
  >();
  for (const row of consumptions) {
    const vId = String(row.variant_id);
    const cur = byVariant.get(vId) ?? {
      quantity: 0,
      dates: new Set<string>(),
    };
    cur.quantity += Number(row.quantity);
    cur.dates.add(String(row.consumption_date));
    byVariant.set(vId, cur);
  }

  const variantIds = [...byVariant.keys()];
  const nameById = new Map<string, { name: string; uom: string }>();
  if (variantIds.length > 0) {
    const db = await getDb();
    const pipeline: Record<string, unknown>[] = [
      { $match: { id: { $in: variantIds } } },
      {
        $lookup: {
          from: 'products',
          localField: 'product_id',
          foreignField: 'id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    ];
    const items = await db.collection('product_variants').aggregate(pipeline).toArray();
    for (const item of items) {
      nameById.set(String(item.id), {
        name: item.product?.name ? String(item.product.name) : 'Unknown',
        uom: item.unit_type ? String(item.unit_type).toLowerCase() : '',
      });
    }
  }

  const variants: RationMonthlyVariantRow[] = variantIds
    .map((variantId) => {
      const agg = byVariant.get(variantId)!;
      const meta = nameById.get(variantId);
      return {
        variant_id: variantId,
        item_name: meta?.name ?? 'Unknown',
        uom: meta?.uom ?? '',
        quantity: Math.round(agg.quantity * 10000) / 10000,
        days_posted: agg.dates.size,
      };
    })
    .sort((a, b) => a.item_name.localeCompare(b.item_name));

  return {
    unit_id: unitId,
    month,
    start,
    end,
    recorded_days: attendance.recorded_days,
    finalized_days: finalizedDays,
    total_present: totalPresent,
    average_present: attendance.average_present,
    days,
    variants,
  };
}

function csvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function monthlyReportToCsv(report: RationMonthlyReport): string {
  const lines: string[] = [
    csvCell('Ration monthly report'),
    [csvCell('Month'), csvCell(report.month)].join(','),
    [csvCell('Recorded days'), csvCell(report.recorded_days)].join(','),
    [csvCell('Finalized days'), csvCell(report.finalized_days)].join(','),
    [csvCell('Total present'), csvCell(report.total_present)].join(','),
    [
      csvCell('Average present'),
      csvCell(report.average_present ?? ''),
    ].join(','),
    '',
    [csvCell('Date'), csvCell('Present count'), csvCell('Status')].join(','),
    ...report.days.map((d) =>
      [csvCell(d.date), csvCell(d.present_count), csvCell(d.status)].join(','),
    ),
    '',
    [
      csvCell('Item'),
      csvCell('UOM'),
      csvCell('Quantity'),
      csvCell('Days posted'),
    ].join(','),
    ...report.variants.map((v) =>
      [
        csvCell(v.item_name),
        csvCell(v.uom),
        csvCell(v.quantity),
        csvCell(v.days_posted),
      ].join(','),
    ),
  ];
  return lines.join('\n');
}
