import type { UnitReportSnapshot } from './types';

function csvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(...cells: Array<string | number>): string {
  return cells.map(csvCell).join(',');
}

/** CSV stringify of a unit KPI snapshot (REQ-RPT-01). Safe for client import. */
export function unitReportToCsv(snapshot: UnitReportSnapshot): string {
  const lines: string[] = [
    csvCell('Unit report'),
    row('Period start', snapshot.periodStart),
    row('Period end', snapshot.periodEnd),
    row('Bar sales total', snapshot.barSalesTotal),
    row('Ration net qty', snapshot.rationNetQty),
    row('Ration net amount', snapshot.rationNetAmount),
    row('Guest room revenue', snapshot.guestRoomRevenue),
    row('Outstanding dues', snapshot.outstandingDues),
    row('Outstanding count', snapshot.outstandingCount),
    '',
    row('Date', 'P-rate'),
    ...snapshot.pRates.map((p) => row(p.date, p.rate)),
  ];
  return lines.join('\n');
}

export function unitReportCsvFilename(snapshot: UnitReportSnapshot): string {
  return `unit-report-${snapshot.periodStart}_${snapshot.periodEnd}.csv`;
}
