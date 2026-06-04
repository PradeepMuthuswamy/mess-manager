'use client';

import { useMemo, useState, useTransition } from 'react';
import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  BULK_IMPORT_SCALE_CSV_TEMPLATE,
  parseBulkImportScale,
  type ParsedBulkImportScale,
} from '@/lib/ration/bulk-import';
import { bulkImportScaleItemsAction } from '@/lib/ration/actions';

export function BulkImportScaleDialog({
  scaleId,
  open,
  onClose,
  onImported,
}: {
  scaleId: string;
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [csv, setCsv] = useState('');
  const [pending, startTransition] = useTransition();

  const parsed: ParsedBulkImportScale = useMemo(
    () => parseBulkImportScale(csv),
    [csv],
  );

  const validRows = parsed.rows.filter((r) => r.parsed != null);
  const invalidRows = parsed.rows.filter((r) => r.error != null);
  const hasFatal = parsed.missingColumns.length > 0;

  function copyTemplate() {
    navigator.clipboard.writeText(BULK_IMPORT_SCALE_CSV_TEMPLATE).then(
      () => toast.success('Template copied to clipboard'),
      () => toast.error('Could not copy'),
    );
  }

  function handleImport() {
    if (validRows.length === 0) return;
    startTransition(async () => {
      const res = await bulkImportScaleItemsAction({
        scale_id: scaleId,
        rows: validRows.map((r) => r.parsed!) as Array<Record<string, unknown>>,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const { inserted, failed, errors } = res.result!;
      if (failed === 0) {
        toast.success(`Imported ${inserted} item${inserted === 1 ? '' : 's'}`);
      } else {
        toast.warning(
          `Imported ${inserted} item${inserted === 1 ? '' : 's'}, ${failed} failed`,
          {
            description:
              errors
                .slice(0, 3)
                .map((e) => `Row ${e.rowNumber} (${e.name}): ${e.message}`)
                .join('\n') +
              (errors.length > 3 ? `\n…and ${errors.length - 3} more` : ''),
          },
        );
      }
      onImported();
      if (failed === 0) {
        setCsv('');
        onClose();
      }
    });
  }

  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title="Bulk import scale items"
      description="Paste a CSV with columns item_name, auth_qty, uom, notes. Items must already exist in the ration or grocery master for this unit."
      contentClassName="sm:max-w-2xl max-h-[90vh]"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            disabled={pending || hasFatal || validRows.length === 0}
            className="transition-ds press"
          >
            {pending
              ? 'Importing…'
              : `Import ${validRows.length} item${validRows.length === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4 px-4 py-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="ration-csv" className="text-sm font-medium">
                CSV data
              </Label>
              <Button type="button" variant="ghost" size="sm" onClick={copyTemplate}>
                Copy template
              </Button>
            </div>
            <Textarea
              id="ration-csv"
              rows={8}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={BULK_IMPORT_SCALE_CSV_TEMPLATE}
              className="font-mono text-xs leading-relaxed"
            />
            <p className="text-xs text-muted-foreground">
              One row per item. The header row is required.
            </p>
          </div>

          {hasFatal ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Missing required column{parsed.missingColumns.length === 1 ? '' : 's'}:{' '}
              <span className="font-mono text-xs">{parsed.missingColumns.join(', ')}</span>
            </div>
          ) : null}

          {!hasFatal && parsed.unknownColumns.length > 0 ? (
            <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Ignoring unknown column{parsed.unknownColumns.length === 1 ? '' : 's'}:{' '}
              <span className="font-mono">{parsed.unknownColumns.join(', ')}</span>
            </div>
          ) : null}

          {parsed.rows.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {validRows.length} ready&nbsp;&middot;&nbsp;{invalidRows.length} invalid
              </p>
              <div className="max-h-64 overflow-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-xs">#</TableHead>
                      <TableHead className="text-xs">Item</TableHead>
                      <TableHead className="text-right text-xs">Qty</TableHead>
                      <TableHead className="text-xs">UoM</TableHead>
                      <TableHead className="text-xs">Notes</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.rows.map((r) => (
                      <TableRow key={r.rowNumber}>
                        <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                          {r.rowNumber}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.parsed?.item_name ?? r.raw[0] ?? '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          {r.parsed?.auth_qty ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs">{r.parsed?.uom ?? '—'}</TableCell>
                        <TableCell className="max-w-32 truncate text-xs text-muted-foreground">
                          {r.parsed?.notes ?? '—'}
                        </TableCell>
                        <TableCell>
                          {r.error ? (
                            <span className="text-xs text-destructive">{r.error}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">OK</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </div>
    </AdaptiveModal>
  );
}
