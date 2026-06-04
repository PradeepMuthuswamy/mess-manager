'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Download, Search } from 'lucide-react';
import { toast } from 'sonner';
import type {
  AuthorisationMatrixRow,
  RationScaleListItem,
} from '@/lib/ration/types';
import { EmptyState } from '@/components/shared/empty-state';

export function AuthorisationMatrix({
  scales,
  rows,
  canWrite,
}: {
  scales: RationScaleListItem[];
  rows: AuthorisationMatrixRow[];
  canWrite: boolean;
}) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.item_name.toLowerCase().includes(needle) ||
        r.category.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  // Group by category, preserving alphabetical within group.
  const grouped = useMemo(() => {
    const m = new Map<string, AuthorisationMatrixRow[]>();
    for (const r of filtered) {
      const k = r.category || 'other';
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  function handleExport() {
    const header = ['Category', 'Item', ...scales.map((s) => s.name)];
    const lines = [header.map(csvCell).join(',')];
    for (const [, items] of grouped) {
      for (const r of items) {
        const row = [r.category, r.item_name];
        for (const s of scales) {
          const cell = r.byScale[s.id];
          row.push(cell ? `${cell.auth_qty} ${cell.uom}` : '');
        }
        lines.push(row.map(csvCell).join(','));
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ration-authorisations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Matrix exported');
  }

  // Compute grid template inline so the column count adapts to any number of scales.
  const gridTemplateColumns = `minmax(220px,1.5fr) repeat(${scales.length}, minmax(140px,1fr))`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search items or categories…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex-1" />
        <Badge variant="secondary" className="hidden sm:inline-flex">
          {filtered.length} item{filtered.length === 1 ? '' : 's'}
        </Badge>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-xs">
        <div className="grid min-w-max" style={{ gridTemplateColumns }}>
          {/* Header row */}
          <div className="sticky top-0 left-0 z-30 flex items-center border-b border-border bg-muted/50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Item
          </div>
          {scales.map((s) => (
            <div
              key={s.id}
              className="sticky top-0 z-20 flex flex-col items-end gap-0.5 border-b border-l border-border bg-muted/50 px-3 py-2 text-right"
            >
              <Link
                href={`/ration/scales/${s.id}`}
                className="transition-ds text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                {s.name}
              </Link>
              <span className="font-mono tabular-nums text-[10px] text-muted-foreground">
                {s.item_count} items
              </span>
            </div>
          ))}

          {/* Category groups */}
          {grouped.length === 0 ? (
            <div
              className="col-span-full px-4 py-12"
              style={{ gridColumn: `1 / span ${scales.length + 1}` }}
            >
              <EmptyState
                title={q ? `No items match "${q}"` : 'No items yet'}
                description={q ? 'Try a different search term.' : 'Items will appear here once scales are configured.'}
              />
            </div>
          ) : (
            grouped.map(([category, items]) => (
              <CategoryGroup
                key={category}
                category={category}
                items={items}
                scales={scales}
                spanCount={scales.length + 1}
              />
            ))
          )}
        </div>
      </div>

      {canWrite ? (
        <p className="text-xs text-muted-foreground">
          Tip: click a scale name in the header to manage its items and version
          history.
        </p>
      ) : null}
    </div>
  );
}

function CategoryGroup({
  category,
  items,
  scales,
  spanCount,
}: {
  category: string;
  items: AuthorisationMatrixRow[];
  scales: RationScaleListItem[];
  spanCount: number;
}) {
  return (
    <>
      <div
        className="border-t border-border bg-muted/30 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        style={{ gridColumn: `1 / span ${spanCount}` }}
      >
        {category || 'other'}
      </div>
      {items.map((r) => (
        <ItemRow key={r.item_id} row={r} scales={scales} />
      ))}
    </>
  );
}

function ItemRow({
  row,
  scales,
}: {
  row: AuthorisationMatrixRow;
  scales: RationScaleListItem[];
}) {
  return (
    <>
      <div className="transition-ds sticky left-0 z-10 flex items-center border-t border-border bg-card px-3 py-2 text-sm hover:bg-muted/40">
        <span className="truncate font-medium text-foreground">{row.item_name}</span>
      </div>
      {scales.map((s) => {
        const cell = row.byScale[s.id];
        return (
          <div
            key={s.id}
            className="transition-ds flex items-center justify-end border-t border-l border-border px-3 py-2 text-right hover:bg-muted/40"
          >
            {cell ? (
              <span
                className="font-mono tabular-nums text-sm text-foreground"
                title={cell.notes ?? undefined}
              >
                {formatQty(cell.auth_qty)}
                <span className="ml-1 text-xs text-muted-foreground">{cell.uom}</span>
              </span>
            ) : (
              <span className="text-muted-foreground/40">—</span>
            )}
          </div>
        );
      })}
    </>
  );
}

function formatQty(n: number): string {
  if (!Number.isFinite(n)) return '—';
  // Keep up to 3 decimal places but strip trailing zeros.
  const s = n.toFixed(3);
  return s.replace(/\.?0+$/, '');
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
