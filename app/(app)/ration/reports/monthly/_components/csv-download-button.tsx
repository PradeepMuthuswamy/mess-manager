'use client';

import { useTransition } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { exportRationMonthlyCsvAction } from './export-csv';

export function CsvDownloadButton({
  unitId,
  month,
}: {
  unitId: string;
  month: string;
}) {
  const [pending, startTransition] = useTransition();

  function download() {
    startTransition(async () => {
      const res = await exportRationMonthlyCsvAction({
        unit_id: unitId,
        month,
      });
      if (!('ok' in res)) {
        toast.error(res.error ?? 'Could not export CSV');
        return;
      }
      const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={download}
      disabled={pending}
    >
      <Download className="size-4" />
      {pending ? 'Exporting…' : 'Download CSV'}
    </Button>
  );
}
