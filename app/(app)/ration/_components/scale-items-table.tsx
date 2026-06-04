'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { History, Layers, Search, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  upsertScaleItemAction,
  removeScaleItemAction,
} from '@/lib/ration/actions';
import type {
  RationScaleItemCurrentRow,
  RationScaleItemVersionRow,
} from '@/lib/ration/types';
import type { EligibleItem } from '@/lib/ration/types';
import { VersionHistorySheet } from './version-history-sheet';
import { BulkImportScaleDialog } from './bulk-import-scale-dialog';
import { BulkUpdateDialog } from './bulk-update-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/shared/empty-state';

const UOMS = ['kg', 'g', 'l', 'ml', 'piece', 'pack', 'bottle'] as const;
type Uom = (typeof UOMS)[number];

type ItemRow = RationScaleItemCurrentRow & { item_id: string; item_name: string };

export function ScaleItemsTable({
  scaleId,
  unitId,
  rows,
  eligible,
  canWrite,
}: {
  scaleId: string;
  unitId: string;
  rows: RationScaleItemCurrentRow[];
  eligible: EligibleItem[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [history, setHistory] = useState<
    | { itemId: string; itemName: string; rows: RationScaleItemVersionRow[] | null }
    | null
  >(null);
  const [removing, setRemoving] = useState<{ itemId: string; itemName: string } | null>(null);
  const [removePending, startRemove] = useTransition();
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows as ItemRow[];
    if (!needle) return list;
    return list.filter(
      (r) =>
        (r.item_name ?? '').toLowerCase().includes(needle) ||
        ((r.category as string | null) ?? '').toLowerCase().includes(needle),
    );
  }, [rows, q]);

  // Eligible items not already on the scale.
  const usedItemIds = useMemo(
    () => new Set(rows.map((r) => r.item_id).filter((x): x is string => !!x)),
    [rows],
  );
  const addableItems = useMemo(
    () => eligible.filter((e) => !usedItemIds.has(e.id)),
    [eligible, usedItemIds],
  );

  const visibleIds = useMemo(
    () => visible.map((r) => r.item_id).filter((x): x is string => !!x),
    [visible],
  );
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = visibleIds.some((id) => selected.has(id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }

  const selectedItemIds = useMemo(() => Array.from(selected), [selected]);
  const selectedNames = useMemo(() => {
    const byId = new Map<string, string>();
    for (const r of rows as ItemRow[]) {
      if (r.item_id) byId.set(r.item_id, r.item_name ?? '');
    }
    return selectedItemIds.map((id) => byId.get(id) || id);
  }, [rows, selectedItemIds]);

  function handleConfirmRemove() {
    if (!removing) return;
    startRemove(async () => {
      const fd = new FormData();
      fd.append('scale_id', scaleId);
      fd.append('item_id', removing.itemId);
      const res = await removeScaleItemAction(null, fd);
      if ('error' in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success('Item removed from scale');
      setRemoving(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search items…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex-1" />
        {canWrite && selected.size > 0 ? (
          <>
            <span className="text-xs text-muted-foreground">
              {selected.size} selected
            </span>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
            <Button size="sm" onClick={() => setBulkOpen(true)}>
              <Layers className="size-4" />
              Bulk update
            </Button>
          </>
        ) : null}
        {canWrite ? (
          <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
            <Upload className="size-4" />
            Bulk import
          </Button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border bg-muted/50 hover:bg-muted/50">
              {canWrite ? (
                <TableHead className="w-10 px-3 py-2">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                    aria-label="Select all visible items"
                  />
                </TableHead>
              ) : null}
              <TableHead className="min-w-[220px] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</TableHead>
              <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</TableHead>
              <TableHead className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Auth qty</TableHead>
              <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">UoM</TableHead>
              <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</TableHead>
              <TableHead className="w-[1%] px-3 py-2" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {canWrite ? (
              <AddItemRow
                scaleId={scaleId}
                items={addableItems}
                onAdded={() => router.refresh()}
              />
            ) : null}
            {visible.length === 0 && !canWrite ? (
              <TableRow>
                <TableCell colSpan={canWrite ? 7 : 6} className="py-12 text-center">
                  <EmptyState
                    title="No items authorised yet"
                    description="Items added to this scale will appear here."
                  />
                </TableCell>
              </TableRow>
            ) : null}
            {visible.map((r) => (
              <ScaleItemRow
                key={r.item_id ?? ''}
                row={r as ItemRow}
                scaleId={scaleId}
                canWrite={canWrite}
                isSelected={selected.has(r.item_id as string)}
                onToggleSelected={() => toggleOne(r.item_id as string)}
                onHistory={() =>
                  setHistory({
                    itemId: r.item_id as string,
                    itemName: r.item_name as string,
                    rows: null,
                  })
                }
                onRemove={() =>
                  setRemoving({
                    itemId: r.item_id as string,
                    itemName: r.item_name as string,
                  })
                }
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <VersionHistorySheet
        scaleId={scaleId}
        item={history ? { id: history.itemId, name: history.itemName } : null}
        open={history != null}
        onClose={() => setHistory(null)}
      />

      <BulkImportScaleDialog
        scaleId={scaleId}
        open={importing}
        onClose={() => setImporting(false)}
        onImported={() => router.refresh()}
      />

      <BulkUpdateDialog
        open={bulkOpen}
        scaleId={scaleId}
        itemIds={selectedItemIds}
        itemNames={selectedNames}
        onClose={() => {
          setBulkOpen(false);
          clearSelection();
        }}
      />

      <AlertDialog open={removing != null} onOpenChange={(v) => !v && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove &ldquo;{removing?.itemName}&rdquo; from this scale?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The item&apos;s current authorisation will be closed. Historical
              versions are kept and visible via the History button if re-added.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removePending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                handleConfirmRemove();
              }}
              disabled={removePending}
            >
              {removePending ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Silence unused warning from unitId for now — reserved for future scoping. */}
      <input type="hidden" value={unitId} readOnly aria-hidden hidden />
    </div>
  );
}

function ScaleItemRow({
  row,
  scaleId,
  canWrite,
  isSelected,
  onToggleSelected,
  onHistory,
  onRemove,
}: {
  row: ItemRow;
  scaleId: string;
  canWrite: boolean;
  isSelected: boolean;
  onToggleSelected: () => void;
  onHistory: () => void;
  onRemove: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const initialQty = Number(row.auth_qty ?? 0);
  const initialUom = ((row.uom as string | null) ?? 'kg') as Uom;
  const initialNotes = row.notes ?? '';

  function submit(patch: { auth_qty?: number; uom?: Uom; notes?: string }) {
    if (!canWrite) return;
    const next = {
      auth_qty: patch.auth_qty ?? initialQty,
      uom: patch.uom ?? initialUom,
      notes: patch.notes ?? initialNotes,
    };
    // Skip submission if nothing changed.
    if (
      Number(next.auth_qty) === Number(initialQty) &&
      next.uom === initialUom &&
      (next.notes ?? '') === (initialNotes ?? '')
    ) {
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.append('scale_id', scaleId);
      fd.append('item_id', row.item_id);
      fd.append('auth_qty', String(next.auth_qty));
      fd.append('uom', next.uom);
      if (next.notes) fd.append('notes', next.notes);
      const res = await upsertScaleItemAction(null, fd);
      if ('error' in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success('Updated');
    });
  }

  return (
    <TableRow
      data-pending={pending || undefined}
      data-selected={isSelected || undefined}
      className="transition-ds border-t border-border hover:bg-muted/40 data-[pending=true]:opacity-60 data-[selected=true]:bg-accent/40"
    >
      {canWrite ? (
        <TableCell className="w-10 px-3 py-2">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelected}
            aria-label={`Select ${row.item_name}`}
          />
        </TableCell>
      ) : null}
      <TableCell className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{row.item_name}</span>
          {row.sku ? (
            <Badge variant="secondary" className="font-mono text-[10px] tabular-nums">
              {row.sku}
            </Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="px-3 py-2 text-xs text-muted-foreground">
        {(row.category as string | null) ?? '—'}
      </TableCell>
      <TableCell className="px-3 py-2 text-right">
        {canWrite ? (
          <Input
            type="number"
            step="0.001"
            min="0"
            defaultValue={initialQty}
            className="ml-auto h-8 max-w-28 text-right font-mono tabular-nums"
            onBlur={(e) => {
              const v = Number(e.currentTarget.value);
              if (Number.isFinite(v) && v >= 0) submit({ auth_qty: v });
            }}
          />
        ) : (
          <span className="font-mono tabular-nums text-sm">{initialQty}</span>
        )}
      </TableCell>
      <TableCell className="px-3 py-2">
        {canWrite ? (
          <Select
            defaultValue={initialUom}
            onValueChange={(v) => submit({ uom: v as Uom })}
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
        ) : (
          <span className="text-sm text-muted-foreground">{initialUom}</span>
        )}
      </TableCell>
      <TableCell className="max-w-[240px] px-3 py-2">
        {canWrite ? (
          <Input
            defaultValue={initialNotes}
            placeholder="—"
            maxLength={500}
            className="h-8"
            onBlur={(e) => submit({ notes: e.currentTarget.value })}
          />
        ) : (
          <span className="text-sm text-muted-foreground">{initialNotes || '—'}</span>
        )}
      </TableCell>
      <TableCell className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon-sm" onClick={onHistory} title="Version history">
            <History className="size-4" />
            <span className="sr-only">History</span>
          </Button>
          {canWrite ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onRemove}
              title="Remove from scale"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
              <span className="sr-only">Remove</span>
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

function AddItemRow({
  scaleId,
  items,
  onAdded,
}: {
  scaleId: string;
  items: EligibleItem[];
  onAdded: () => void;
}) {
  const [selected, setSelected] = useState<EligibleItem | null>(null);
  const [qty, setQty] = useState('');
  const [uom, setUom] = useState<Uom>('kg');
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();

  function reset() {
    setSelected(null);
    setQty('');
    setUom('kg');
    setNotes('');
  }

  function handleAdd() {
    if (!selected) {
      toast.error('Pick an item to add');
      return;
    }
    const qtyNum = Number(qty);
    if (!Number.isFinite(qtyNum) || qtyNum < 0) {
      toast.error('Enter a valid quantity');
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.append('scale_id', scaleId);
      fd.append('item_id', selected.id);
      fd.append('auth_qty', String(qtyNum));
      fd.append('uom', uom);
      if (notes) fd.append('notes', notes);
      const res = await upsertScaleItemAction(null, fd);
      if ('error' in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${selected.name} added`);
      reset();
      onAdded();
    });
  }

  return (
    <TableRow className="border-t border-border bg-muted/30">
      <TableCell className="w-10 px-3 py-2" />
      <TableCell className="px-3 py-2">
        <Combobox
          items={items}
          itemToStringValue={(it) => (it as EligibleItem).id}
          itemToStringLabel={(it) => (it as EligibleItem).name}
          value={selected}
          onValueChange={(v) => {
            const next = v as EligibleItem | null;
            setSelected(next);
            if (next?.uom) setUom(next.uom as Uom);
          }}
        >
          <ComboboxInput
            placeholder={items.length === 0 ? 'No items available' : 'Add item…'}
            disabled={items.length === 0}
            className="h-8 w-full"
          />
          <ComboboxContent>
            <ComboboxList>
              <ComboboxEmpty>No matching items</ComboboxEmpty>
              {items.map((it) => (
                <ComboboxItem key={it.id} value={it}>
                  <div className="flex flex-col">
                    <span className="text-sm">{it.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {it.category} · {it.uom}
                    </span>
                  </div>
                </ComboboxItem>
              ))}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </TableCell>
      <TableCell className="px-3 py-2 text-xs text-muted-foreground">
        {selected?.category ?? '—'}
      </TableCell>
      <TableCell className="px-3 py-2 text-right">
        <Input
          type="number"
          step="0.001"
          min="0"
          value={qty}
          onChange={(e) => setQty(e.currentTarget.value)}
          placeholder="0.000"
          className="ml-auto h-8 max-w-28 text-right font-mono tabular-nums"
          disabled={!selected}
        />
      </TableCell>
      <TableCell className="px-3 py-2">
        <Select value={uom} onValueChange={(v) => setUom(v as Uom)}>
          <SelectTrigger className="h-8 w-24" disabled={!selected}>
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
      <TableCell className="px-3 py-2">
        <Input
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          placeholder="Notes (optional)"
          maxLength={500}
          className="h-8"
          disabled={!selected}
        />
      </TableCell>
      <TableCell className="px-3 py-2 text-right">
        <Button size="sm" onClick={handleAdd} disabled={pending || !selected}>
          {pending ? 'Adding…' : 'Add'}
        </Button>
      </TableCell>
    </TableRow>
  );
}
