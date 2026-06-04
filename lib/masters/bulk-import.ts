// Shared CSV / XLSX parsing + row validation for the masters bulk-import feature.
// Used by the client preview and the server action.

import { z } from 'zod';
import * as XLSX from 'xlsx';
import { uomSchema } from '@/lib/schemas/items';

export const BULK_IMPORT_COLUMNS = [
  'name',
  'sku',
  'uom',
  'rate',
  'ration_scale',
  'notes',
] as const;
export type BulkImportColumn = (typeof BULK_IMPORT_COLUMNS)[number];

export const bulkImportRowSchema = z.object({
  name:         z.string().trim().min(1).max(200),
  sku:          z.string().trim().max(50).optional().nullable(),
  uom:          uomSchema,
  rate:         z.coerce.number().nonnegative(),
  ration_scale: z.coerce.number().nonnegative().optional().nullable(),
  notes:        z.string().trim().max(500).optional().nullable(),
});
export type BulkImportRow = z.infer<typeof bulkImportRowSchema>;

// Minimal RFC 4180-ish CSV parser. Handles quoted fields, embedded commas,
// doubled-quote escapes (""), and CRLF/LF line endings. Trailing blank lines
// are ignored. No streaming — bulk imports are small enough.
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        // close field + row; collapse \r\n
        row.push(field);
        field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
        if (ch === '\r' && input[i + 1] === '\n') i++;
      } else {
        field += ch;
      }
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

export type ParsedBulkImport = {
  headers: string[];
  // For each data row: either the validated payload OR an error message.
  rows: Array<{
    raw: string[];
    parsed?: BulkImportRow;
    error?: string;
    rowNumber: number; // 1-based, excluding header
  }>;
  // Headers we found but don't understand (warning, not fatal).
  unknownColumns: string[];
  // Required headers that are missing (fatal).
  missingColumns: BulkImportColumn[];
};

const REQUIRED_HEADERS: BulkImportColumn[] = ['name', 'uom', 'rate'];

export function parseBulkImport(input: string): ParsedBulkImport {
  const raw = parseCsv(input);
  return parseBulkImportRows(raw);
}

export function parseBulkImportRows(raw: string[][]): ParsedBulkImport {
  if (raw.length === 0) {
    return {
      headers: [],
      rows: [],
      unknownColumns: [],
      missingColumns: REQUIRED_HEADERS,
    };
  }
  const headers = raw[0].map((h) => (h ?? '').toString().trim().toLowerCase());
  const dataRows = raw.slice(1);

  const knownCols = new Set<string>(BULK_IMPORT_COLUMNS);
  const unknownColumns = headers.filter((h) => h && !knownCols.has(h));
  const missingColumns = REQUIRED_HEADERS.filter((c) => !headers.includes(c));

  // index lookups for each known column
  const idx: Partial<Record<BulkImportColumn, number>> = {};
  for (const col of BULK_IMPORT_COLUMNS) {
    const i = headers.indexOf(col);
    if (i !== -1) idx[col] = i;
  }

  const rows = dataRows.map((cells, rowIdx) => {
    const rowNumber = rowIdx + 1;
    const normalised = cells.map((c) => (c ?? '').toString());
    if (normalised.every((c) => c.trim() === '')) {
      return { raw: normalised, error: 'Empty row', rowNumber };
    }
    const candidate: Record<string, string | null> = {};
    for (const col of BULK_IMPORT_COLUMNS) {
      const i = idx[col];
      candidate[col] = i == null ? null : (normalised[i] ?? '').trim() || null;
    }
    const result = bulkImportRowSchema.safeParse(candidate);
    if (!result.success) {
      const first = result.error.issues[0];
      const path = first.path.join('.');
      return {
        raw: normalised,
        error: `${path}: ${first.message}`,
        rowNumber,
      };
    }
    return { raw: normalised, parsed: result.data, rowNumber };
  });

  return { headers, rows, unknownColumns, missingColumns };
}

// Read an .xlsx / .xls file (the first sheet) into a 2D array of strings.
// Empty trailing rows are stripped so the preview doesn't show blanks.
export function parseExcelBuffer(buffer: ArrayBuffer): string[][] {
  const wb = XLSX.read(buffer, { type: 'array' });
  const firstName = wb.SheetNames[0];
  if (!firstName) return [];
  const ws = wb.Sheets[firstName];
  // header:1 → array-of-arrays; defval:'' → keep empty cells aligned;
  // raw:false → coerce dates/numbers to readable strings.
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: '',
    raw: false,
  });
  const stringified: string[][] = rows.map((r) =>
    r.map((v) => (v == null ? '' : String(v))),
  );
  while (stringified.length && stringified[stringified.length - 1].every((c) => c.trim() === '')) {
    stringified.pop();
  }
  return stringified;
}

export async function parseExcelFile(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer();
  return parseExcelBuffer(buf);
}

// CSV template — also used by the "Copy template" button.
export const BULK_IMPORT_CSV_TEMPLATE = `name,sku,uom,rate,ration_scale,notes
Atta,ATA-001,kg,42.50,0.250,Wheat flour
Rice (basmati),RIC-002,kg,98.00,0.250,
`;

// Build an .xlsx template Blob that mirrors the CSV layout, with example rows
// and column widths set so the downloaded file is friendly to fill in.
export function buildExcelTemplate(): Blob {
  const aoa: (string | number)[][] = [
    [...BULK_IMPORT_COLUMNS],
    ['Atta',            'ATA-001', 'kg', 42.50, 0.250, 'Wheat flour'],
    ['Rice (basmati)',  'RIC-002', 'kg', 98.00, 0.250, ''],
    ['Sugar',           'SUG-003', 'kg', 45.00, 0.090, ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Column widths (in characters).
  ws['!cols'] = [
    { wch: 22 }, // name
    { wch: 12 }, // sku
    { wch: 8 },  // uom
    { wch: 10 }, // rate
    { wch: 14 }, // ration_scale
    { wch: 32 }, // notes
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'items');
  const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Blob([arr], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
