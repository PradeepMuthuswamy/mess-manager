'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileDown, Upload } from 'lucide-react';
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
import { importCalendarEventsAction } from '@/lib/calendar/actions';
import { importRowSchema, type ImportRowInput } from '@/lib/schemas/calendar';
import { toast } from 'sonner';

const CSV_COLUMNS = ['date', 'type', 'member', 'title', 'notes'] as const;
const CSV_TEMPLATE = [
  'date,type,member,title,notes',
  '2026-10-15,birthday,IC-12345,Capt Sharma birthday,',
  '2026-11-01,formal_night,,Dining-in night,Mess kit',
].join('\n');

type PreviewRow = {
  rowNumber: number;
  raw: Record<(typeof CSV_COLUMNS)[number], string>;
  parsed: ImportRowInput | null;
  error: string | null;
};

function splitCsvLine(line: string) {
  return line.split(',').map((cell) => cell.trim());
}

function parseCalendarCsv(text: string): { rows: PreviewRow[]; missingColumns: string[] } {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return { rows: [], missingColumns: [] };

  const header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const missingColumns = CSV_COLUMNS.filter((column) => !header.includes(column));
  const index = {
    date: header.indexOf('date'),
    type: header.indexOf('type'),
    member: header.indexOf('member'),
    title: header.indexOf('title'),
    notes: header.indexOf('notes'),
  };

  const rows = lines.slice(1).map((line, i) => {
    const cols = splitCsvLine(line);
    const raw = {
      date: index.date >= 0 ? (cols[index.date] ?? '') : '',
      type: index.type >= 0 ? (cols[index.type] ?? '') : '',
      member: index.member >= 0 ? (cols[index.member] ?? '') : '',
      title: index.title >= 0 ? (cols[index.title] ?? '') : '',
      notes: index.notes >= 0 ? (cols[index.notes] ?? '') : '',
    };
    const parsed = importRowSchema.safeParse({
      date: raw.date,
      type: raw.type,
      member: raw.member || null,
      title: raw.title,
      notes: raw.notes || null,
    });
    return {
      rowNumber: i + 2,
      raw,
      parsed: parsed.success ? parsed.data : null,
      error: parsed.success ? null : parsed.error.issues[0]?.message ?? 'Invalid row',
    };
  });

  return { rows, missingColumns };
}

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'social-calendar-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportDialog({ unitId }: { unitId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [pending, start] = useTransition();

  const parsedCsv = useMemo(() => parseCalendarCsv(csv), [csv]);
  const rows = parsedCsv.rows;
  const validRows = rows.filter((row) => row.parsed);
  const missingColumns = parsedCsv.missingColumns;

  function close() {
    setOpen(false);
  }

  function handleImport() {
    if (validRows.length === 0) return;
    start(async () => {
      const res = await importCalendarEventsAction(
        unitId,
        validRows.map((row) => row.parsed),
      );
      if ('error' in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Imported ${res.inserted} event${res.inserted === 1 ? '' : 's'}${
          res.skipped ? `, skipped ${res.skipped}` : ''
        }`,
      );
      setCsv('');
      close();
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="size-4" />
        Import CSV
      </Button>
      <AdaptiveModal
        open={open}
        onClose={close}
        title="Import social calendar"
        description="CSV columns: date, type, member, title, notes. Member is an email or service number."
        contentClassName="sm:max-w-2xl max-h-[85vh]"
        footer={
          <>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleImport}
              disabled={pending || validRows.length === 0 || missingColumns.length > 0}
            >
              {pending
                ? 'Importing…'
                : `Import ${validRows.length} row${validRows.length === 1 ? '' : 's'}`}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
            >
              <FileDown className="size-4" />
              Download template
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.currentTarget.files?.[0];
                if (!file) return;
                setCsv(await file.text());
                e.currentTarget.value = '';
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-4" />
              Choose CSV
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cal-csv">Paste CSV</Label>
            <Textarea
              id="cal-csv"
              rows={8}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={CSV_TEMPLATE}
              className="font-mono text-xs"
            />
          </div>

          {missingColumns.length > 0 ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Missing column{missingColumns.length === 1 ? '' : 's'}: {missingColumns.join(', ')}
            </p>
          ) : null}

          {rows.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-xs">
                <span className="font-medium tabular-nums text-foreground">
                  {validRows.length} ready
                </span>
                {rows.length - validRows.length > 0 ? (
                  <span className="tabular-nums text-destructive">
                    {rows.length - validRows.length} invalid
                  </span>
                ) : null}
              </div>
              <div className="max-h-64 overflow-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10 font-mono text-xs">#</TableHead>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Member</TableHead>
                      <TableHead className="text-xs">Title</TableHead>
                      <TableHead className="text-xs">Notes</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.rowNumber}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {row.rowNumber}
                        </TableCell>
                        <TableCell className="text-xs">{row.raw.date || '—'}</TableCell>
                        <TableCell className="text-xs">{row.raw.type || '—'}</TableCell>
                        <TableCell className="text-xs">{row.raw.member || '—'}</TableCell>
                        <TableCell className="text-sm">{row.raw.title || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.raw.notes || '—'}
                        </TableCell>
                        <TableCell>
                          {row.error ? (
                            <span className="text-xs text-destructive">{row.error}</span>
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
    </>
  );
}
