'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { unitReportCsvFilename, unitReportToCsv } from '@/lib/reports/export';
import type { UnitReportSnapshot } from '@/lib/reports/types';

export function ExportButton({ snapshot }: { snapshot: UnitReportSnapshot }) {
  function download() {
    const csv = unitReportToCsv(snapshot);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = unitReportCsvFilename(snapshot);
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={download}>
      <Download className="size-4" />
      Download CSV
    </Button>
  );
}
