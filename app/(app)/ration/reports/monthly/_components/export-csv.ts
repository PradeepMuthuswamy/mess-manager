'use server';

import { requireCapability } from '@/lib/auth/require-capability';
import {
  getRationMonthlyReport,
  monthlyReportToCsv,
  parseReportMonth,
} from '@/lib/ration/reports';

export async function exportRationMonthlyCsvAction(input: {
  unit_id: string;
  month: string;
}): Promise<{ ok: true; csv: string; filename: string } | { error: string }> {
  if (!input.unit_id) return { error: 'Missing unit' };
  const month = parseReportMonth(input.month);
  await requireCapability('ration.read', input.unit_id);

  try {
    const report = await getRationMonthlyReport(input.unit_id, month);
    return {
      ok: true,
      csv: monthlyReportToCsv(report),
      filename: `ration-monthly-${month}.csv`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not export report';
    return { error: message };
  }
}
