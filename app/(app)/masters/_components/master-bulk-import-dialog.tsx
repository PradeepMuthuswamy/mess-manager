'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
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
  BULK_IMPORT_CSV_TEMPLATE,
  buildExcelTemplate,
  parseBulkImport,
  parseBulkImportRows,
  parseCsv,
  parseExcelFile,
  type ParsedBulkImport,
} from '@/lib/masters/bulk-import';
import { bulkImportMasterItemsAction } from '@/lib/masters/actions';
import { CATEGORY_META } from '@/lib/masters/categories';
import type { Category } from '@/lib/masters/categories';
import { FileDown, Upload } from 'lucide-react';

export function MasterBulkImportDialog({
  open,
  category,
  unitId,
  isAllUnits,
  onClose,
  onImported,
}: {
  open: boolean;
  category: Category;
  unitId: string | null; // active unit; null = global if isAllUnits
  isAllUnits: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [csv, setCsv] = useState('');
  const [excelRows, setExcelRows] = useState<string[][] | null>(null);
  const [excelFileName, setExcelFileName] = useState<string | null>(null);
  const [scope, setScope] = useState<'unit' | 'global'>(
    unitId ? 'unit' : 'global',
  );
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // If an Excel file is loaded, prefer its rows. Otherwise parse the pasted CSV.
  const parsed: ParsedBulkImport = useMemo(() => {
    if (excelRows) return parseBulkImportRows(excelRows);
    return parseBulkImport(csv);
  }, [csv, excelRows]);

  const validRows = parsed.rows.filter((r) => r.parsed != null);
  const invalidRows = parsed.rows.filter((r) => r.error != null);
  const hasFatal = parsed.missingColumns.length > 0;
  const showRationScale = category === 'ration';

  // Choose target unit_id for the import.
  const targetUnitId: string | null = isAllUnits
    ? scope === 'global'
      ? null
      : unitId
    : unitId;

  function copyTemplate() {
    navigator.clipboard.writeText(BULK_IMPORT_CSV_TEMPLATE).then(
      () => toast.success('CSV template copied to clipboard'),
      () => toast.error('Could not copy'),
    );
  }

  function downloadExcel() {
    const blob = buildExcelTemplate();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `masters-${category}-template.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Excel template downloaded');
  }

  function downloadCsv() {
    const blob = new Blob([BULK_IMPORT_CSV_TEMPLATE], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `masters-${category}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File) {
    const lower = file.name.toLowerCase();
    try {
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        const rows = await parseExcelFile(file);
        setExcelRows(rows);
        setExcelFileName(file.name);
        setCsv('');
        toast.success(`Loaded ${file.name} (${Math.max(0, rows.length - 1)} rows)`);
      } else if (lower.endsWith('.csv') || file.type === 'text/csv') {
        const text = await file.text();
        setCsv(text);
        const rowCount = Math.max(0, parseCsv(text).length - 1);
        setExcelRows(null);
        setExcelFileName(null);
        toast.success(`Loaded ${file.name} (${rowCount} rows)`);
      } else {
        toast.error('Unsupported file. Pick .xlsx, .xls, or .csv');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not read file');
    }
  }

  function clearExcel() {
    setExcelRows(null);
    setExcelFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleImport() {
    if (validRows.length === 0) return;
    if (!isAllUnits && !unitId) {
      toast.error('No active unit — pick one in the navbar first');
      return;
    }
    if (isAllUnits && scope === 'unit' && !unitId) {
      toast.error('Pick a unit (use the unit switcher) before importing as unit-scoped');
      return;
    }
    startTransition(async () => {
      const res = await bulkImportMasterItemsAction({
        category,
        unit_id: targetUnitId,
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
              (errors.length > 3 ? `\n...and ${errors.length - 3} more` : ''),
          },
        );
      }
      onImported();
      if (failed === 0) {
        setCsv('');
        clearExcel();
        onClose();
      }
    });
  }

  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title={`Bulk import — ${CATEGORY_META[category].title}`}
      contentClassName="sm:max-w-2xl max-h-[85vh]"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="transition-ds"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            disabled={
              isPending ||
              hasFatal ||
              validRows.length === 0 ||
              (!isAllUnits && !unitId) ||
              (isAllUnits && scope === 'unit' && !unitId)
            }
            className="transition-ds press"
          >
            {isPending
              ? 'Importing...'
              : `Import ${validRows.length} item${validRows.length === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Upload an Excel (.xlsx) or CSV file, or paste CSV below. Required
          columns: <code className="font-mono text-foreground/80">name</code>,{' '}
          <code className="font-mono text-foreground/80">uom</code>,{' '}
          <code className="font-mono text-foreground/80">rate</code>. Optional:{' '}
          <code className="font-mono text-foreground/80">sku</code>,{' '}
          <code className="font-mono text-foreground/80">ration_scale</code>,{' '}
          <code className="font-mono text-foreground/80">notes</code>.
        </p>
          {isAllUnits ? (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground">Import as</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={scope === 'unit' ? 'default' : 'outline'}
                  onClick={() => setScope('unit')}
                  disabled={!unitId}
                  title={!unitId ? 'Pick a unit in the navbar first' : undefined}
                  className="transition-ds"
                >
                  Unit-scoped {unitId ? '' : '(pick a unit first)'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={scope === 'global' ? 'default' : 'outline'}
                  onClick={() => setScope('global')}
                  className="transition-ds"
                >
                  Global catalog
                </Button>
              </div>
            </div>
          ) : null}

          {/* Templates */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground">Templates</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={downloadExcel}
                className="transition-ds gap-1.5"
              >
                <FileDown className="size-4" />
                Excel template
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={downloadCsv}
                className="transition-ds gap-1.5"
              >
                <FileDown className="size-4" />
                CSV template
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={copyTemplate}
                className="transition-ds"
              >
                Copy CSV to clipboard
              </Button>
            </div>
          </div>

          {/* File upload */}
          <div className="space-y-1.5">
            <Label htmlFor="bulk-file" className="text-sm font-medium text-foreground">
              Upload a file
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                id="bulk-file"
                type="file"
                accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="transition-ds gap-1.5"
              >
                <Upload className="size-4" />
                Choose .xlsx / .csv
              </Button>
              {excelFileName ? (
                <>
                  <span className="text-xs text-muted-foreground font-mono">
                    {excelFileName}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearExcel}
                    className="transition-ds"
                  >
                    Remove
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          {/* CSV paste */}
          <div className="space-y-1.5">
            <Label htmlFor="csv" className="text-sm font-medium text-foreground">
              ...or paste CSV
            </Label>
            <Textarea
              id="csv"
              rows={8}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                if (excelRows) clearExcel();
              }}
              placeholder={BULK_IMPORT_CSV_TEMPLATE}
              className="font-mono text-xs"
              disabled={excelRows != null}
            />
            {excelRows != null ? (
              <p className="text-xs text-muted-foreground">
                Using the uploaded Excel file. Remove it to paste CSV instead.
              </p>
            ) : null}
          </div>

          {/* Fatal column errors */}
          {hasFatal ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Missing required column{parsed.missingColumns.length === 1 ? '' : 's'}:{' '}
              <span className="font-mono tabular-nums">
                {parsed.missingColumns.join(', ')}
              </span>
            </div>
          ) : null}

          {/* Unknown column warning */}
          {!hasFatal && parsed.unknownColumns.length > 0 ? (
            <div className="rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Ignoring unknown column{parsed.unknownColumns.length === 1 ? '' : 's'}:{' '}
              <span className="font-mono">{parsed.unknownColumns.join(', ')}</span>
            </div>
          ) : null}

          {/* Preview table */}
          {parsed.rows.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-foreground tabular-nums">
                  {validRows.length} ready
                </span>
                {invalidRows.length > 0 && (
                  <span className="text-xs text-destructive tabular-nums">
                    {invalidRows.length} invalid
                  </span>
                )}
              </div>
              <div className="rounded-md border max-h-64 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10 font-mono text-xs tabular-nums">#</TableHead>
                      <TableHead className="text-xs font-medium">Name</TableHead>
                      <TableHead className="text-xs font-medium">SKU</TableHead>
                      <TableHead className="text-xs font-medium">UoM</TableHead>
                      <TableHead className="text-right text-xs font-medium">Rate</TableHead>
                      {showRationScale ? (
                        <TableHead className="text-right text-xs font-medium">Scale</TableHead>
                      ) : null}
                      <TableHead className="text-xs font-medium">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.rows.map((r) => (
                      <TableRow key={r.rowNumber}>
                        <TableCell className="text-muted-foreground text-xs font-mono tabular-nums">
                          {r.rowNumber}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.parsed?.name ?? r.raw[0] ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {r.parsed?.sku ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.parsed?.uom ?? '—'}
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono tabular-nums">
                          {r.parsed ? `₹${r.parsed.rate.toFixed(2)}` : '—'}
                        </TableCell>
                        {showRationScale ? (
                          <TableCell className="text-right text-xs font-mono tabular-nums">
                            {r.parsed?.ration_scale != null
                              ? r.parsed.ration_scale.toFixed(3)
                              : '—'}
                          </TableCell>
                        ) : null}
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
