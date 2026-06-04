'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AdaptiveModal } from '@/components/shared/adaptive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { bulkUpdateMasterItemsAction, type MasterPatch } from '@/lib/masters/actions';
import type { MasterRow } from '@/lib/masters/types';
import type { Category } from '@/lib/masters/categories';

const UOMS = ['kg', 'g', 'l', 'ml', 'piece', 'pack', 'bottle'] as const;
type Uom = (typeof UOMS)[number];

type Draft = {
  name: string;
  sku: string;
  uom: Uom;
  is_active: boolean;
};

function rowToDraft(row: MasterRow): Draft {
  return {
    name: row.name ?? '',
    sku: row.sku ?? '',
    uom: (row.uom as Uom) ?? 'kg',
    is_active: row.is_active ?? true,
  };
}

function diff(orig: Draft, next: Draft): Partial<MasterPatch> | null {
  const p: Partial<MasterPatch> = {};
  if (next.name.trim() && next.name !== orig.name) p.name = next.name.trim();
  if (next.sku !== orig.sku) p.sku = next.sku.trim() || null;
  if (next.uom !== orig.uom) p.uom = next.uom;
  if (next.is_active !== orig.is_active) p.is_active = next.is_active;
  return Object.keys(p).length === 0 ? null : p;
}

export function MasterMultiEditDialog({
  open,
  category: _category,
  rows,
  onClose,
}: {
  open: boolean;
  category: Category;
  rows: MasterRow[];
  onClose: () => void;
}) {
  // category is part of the public props (so the caller doesn't have to change),
  // but the dialog no longer renders any category-specific columns (rate, scale).
  void _category;
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const d: Record<string, Draft> = {};
    for (const r of rows) d[r.id] = rowToDraft(r);
    return d;
  });
  const [filter, setFilter] = useState('');
  const [pending, startTransition] = useTransition();

  const originals = useMemo(() => {
    const m: Record<string, Draft> = {};
    for (const r of rows) m[r.id] = rowToDraft(r);
    return m;
  }, [rows]);

  const dirtyIds = useMemo(() => {
    const ids: string[] = [];
    for (const r of rows) {
      const o = originals[r.id];
      const d = drafts[r.id];
      if (!o || !d) continue;
      if (diff(o, d) != null) ids.push(r.id);
    }
    return ids;
  }, [drafts, originals, rows]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.name, r.sku ?? ''].some((s) => s.toLowerCase().includes(needle)),
    );
  }, [rows, filter]);

  function patch(id: string, mutate: (d: Draft) => Draft) {
    setDrafts((prev) => ({ ...prev, [id]: mutate(prev[id]) }));
  }

  function resetRow(id: string) {
    setDrafts((prev) => ({ ...prev, [id]: originals[id] }));
  }

  function handleSave() {
    if (dirtyIds.length === 0) {
      toast.info('No changes to save');
      return;
    }
    const patches: MasterPatch[] = [];
    for (const id of dirtyIds) {
      const d = diff(originals[id], drafts[id]);
      if (d) patches.push({ id, ...d });
    }
    startTransition(async () => {
      const res = await bulkUpdateMasterItemsAction({ patches });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const { updated, failed, errors } = res.result!;
      if (failed === 0) {
        toast.success(`Saved ${updated} change${updated === 1 ? '' : 's'}`);
        router.refresh();
        onClose();
        return;
      }
      toast.warning(`Saved ${updated}, ${failed} failed`, {
        description:
          errors
            .slice(0, 3)
            .map((e) => e.message)
            .join('\n') +
          (errors.length > 3 ? `\n...and ${errors.length - 3} more` : ''),
      });
      router.refresh();
    });
  }

  return (
    <AdaptiveModal
      open={open}
      onClose={onClose}
      title={`Edit all ${rows.length} item${rows.length === 1 ? '' : 's'}`}
      description="Edit any field inline. Only changed rows are saved when you click Save."
      contentClassName="sm:max-w-5xl max-h-[85vh]"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={pending}
            className="transition-ds"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={pending || dirtyIds.length === 0}
            className="transition-ds press"
          >
            {pending
              ? 'Saving...'
              : `Save ${dirtyIds.length} change${dirtyIds.length === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
          {/* Toolbar: search + dirty-count badge */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-xs flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search items..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="flex-1" />
            <Badge
              variant={dirtyIds.length > 0 ? 'default' : 'secondary'}
              className="tabular-nums"
            >
              {dirtyIds.length} pending change{dirtyIds.length === 1 ? '' : 's'}
            </Badge>
          </div>

          {/* Inline table */}
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="min-w-[220px] text-xs font-medium">Name</TableHead>
                  <TableHead className="min-w-[120px] text-xs font-medium">SKU</TableHead>
                  <TableHead className="text-xs font-medium">UoM</TableHead>
                  <TableHead className="text-xs font-medium">Status</TableHead>
                  <TableHead className="w-[1%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No matching items.
                    </TableCell>
                  </TableRow>
                ) : null}
                {visible.map((r) => {
                  const d = drafts[r.id];
                  const o = originals[r.id];
                  if (!d || !o) return null;
                  const isDirty = diff(o, d) != null;
                  return (
                    <TableRow
                      key={r.id}
                      data-dirty={isDirty || undefined}
                      className="data-[dirty=true]:bg-accent/30"
                    >
                      <TableCell>
                        <Input
                          value={d.name}
                          onChange={(e) =>
                            patch(r.id, (cur) => ({ ...cur, name: e.currentTarget.value }))
                          }
                          className="h-8"
                        />
                        {r.unit_id == null ? (
                          <span className="mt-1 inline-block text-[10px] text-muted-foreground">
                            Global
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={d.sku}
                          onChange={(e) =>
                            patch(r.id, (cur) => ({ ...cur, sku: e.currentTarget.value }))
                          }
                          className="h-8 font-mono text-xs"
                          placeholder="—"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={d.uom}
                          onValueChange={(v) =>
                            patch(r.id, (cur) => ({ ...cur, uom: v as Uom }))
                          }
                        >
                          <SelectTrigger className="h-8 w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {UOMS.map((u) => (
                              <SelectItem key={u} value={u}>
                                {u}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={d.is_active ? 'true' : 'false'}
                          onValueChange={(v) =>
                            patch(r.id, (cur) => ({ ...cur, is_active: v === 'true' }))
                          }
                        >
                          <SelectTrigger className="h-8 w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Active</SelectItem>
                            <SelectItem value="false">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        {isDirty ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => resetRow(r.id)}
                            className="text-muted-foreground transition-ds"
                          >
                            Reset
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
    </AdaptiveModal>
  );
}
