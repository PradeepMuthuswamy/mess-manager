// Shared CSV parsing + row validation for the ration-scale bulk-import feature.
// Mirrors lib/masters/bulk-import.ts. Used by client preview and server action.

import { z } from 'zod';
import { uomSchema } from '@/lib/schemas/items';
import { parseCsv } from '@/lib/masters/bulk-import';

export const BULK_IMPORT_SCALE_COLUMNS = [
  'item_name',
  'auth_qty',
  'uom',
  'notes',
] as const;
export type BulkImportScaleColumn = (typeof BULK_IMPORT_SCALE_COLUMNS)[number];

export const bulkImportScaleRowSchema = z.object({
  item_name: z.string().trim().min(1).max(200),
  auth_qty:  z.coerce.number().nonnegative(),
  uom:       uomSchema,
  notes:     z.string().trim().max(500).optional().nullable(),
});
export type BulkImportScaleRow = z.infer<typeof bulkImportScaleRowSchema>;

export type ParsedBulkImportScale = {
  headers: string[];
  rows: Array<{
    raw: string[];
    parsed?: BulkImportScaleRow;
    error?: string;
    rowNumber: number; // 1-based, excluding header
  }>;
  unknownColumns: string[];
  missingColumns: BulkImportScaleColumn[];
};

const REQUIRED_HEADERS: BulkImportScaleColumn[] = ['item_name', 'auth_qty', 'uom'];

export function parseBulkImportScale(input: string): ParsedBulkImportScale {
  const raw = parseCsv(input);
  if (raw.length === 0) {
    return {
      headers: [],
      rows: [],
      unknownColumns: [],
      missingColumns: REQUIRED_HEADERS,
    };
  }
  const headers = raw[0].map((h) => h.trim().toLowerCase());
  const dataRows = raw.slice(1);

  const knownCols = new Set<string>(BULK_IMPORT_SCALE_COLUMNS);
  const unknownColumns = headers.filter((h) => !knownCols.has(h));
  const missingColumns = REQUIRED_HEADERS.filter((c) => !headers.includes(c));

  const idx: Partial<Record<BulkImportScaleColumn, number>> = {};
  for (const col of BULK_IMPORT_SCALE_COLUMNS) {
    const i = headers.indexOf(col);
    if (i !== -1) idx[col] = i;
  }

  const rows = dataRows.map((cells, rowIdx) => {
    const rowNumber = rowIdx + 1;
    if (cells.every((c) => c.trim() === '')) {
      return { raw: cells, error: 'Empty row', rowNumber };
    }
    const candidate: Record<string, string | null> = {};
    for (const col of BULK_IMPORT_SCALE_COLUMNS) {
      const i = idx[col];
      candidate[col] = i == null ? null : (cells[i] ?? '').trim() || null;
    }
    const result = bulkImportScaleRowSchema.safeParse(candidate);
    if (!result.success) {
      const first = result.error.issues[0];
      const path = first.path.join('.');
      return {
        raw: cells,
        error: `${path}: ${first.message}`,
        rowNumber,
      };
    }
    return { raw: cells, parsed: result.data, rowNumber };
  });

  return { headers, rows, unknownColumns, missingColumns };
}

export const BULK_IMPORT_SCALE_CSV_TEMPLATE = `item_name,auth_qty,uom,notes
Rice (basmati),0.250,kg,
Atta,0.250,kg,Wheat flour
Sugar,0.090,kg,
Tea,0.009,kg,
Onion,0.120,kg,
`;
